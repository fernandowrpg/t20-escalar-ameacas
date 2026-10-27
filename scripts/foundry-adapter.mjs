import { computePlan } from "./scaler.mjs";

export const MODULE_ID = "t20-escalar-ameacas";

/**
 * Entradas vazias deixadas por versões antigas do T20 ("ofi0" e "_pc0"). O próprio
 * sistema as remove na migração 1.5.010, mas fichas importadas depois ainda podem
 * trazê-las. Só removemos se estiverem sem nome, para não apagar perícia real.
 */
const LEGACY_SKILLS = ["ofi0", "_pc0"];

function legacySkillKeys(pericias) {
	return LEGACY_SKILLS.filter((k) => pericias?.[k] && !pericias[k].label && !pericias[k].nome);
}

/** Converte um Actor do Foundry na estrutura usada por computePlan. */
export function snapshotActor(actor) {
	const sys = actor.system;
	const src = actor._source?.system ?? {};
	const skills = {};
	const legacy = legacySkillKeys(src.pericias);
	for (const [key, s] of Object.entries(sys.pericias ?? {})) {
		if (!s || typeof s !== "object" || legacy.includes(key)) continue;
		const label = s.label || CONFIG.T20?.pericias?.[key]?.label || key;
		skills[key] = {
			value: Number(s.value) || 0,
			outros: Number(src.pericias?.[key]?.outros ?? s.outros) || 0,
			treinado: !!s.treinado,
			label: s.nome || game.i18n.localize(label)
		};
	}
	return {
		name: actor.name,
		nd: String(src.attributes?.nd ?? sys.attributes?.nd ?? "1"),
		role: src.detalhes?.role ?? sys.detalhes?.role ?? "",
		defesa: {
			value: Number(sys.attributes?.defesa?.value) || 0,
			base: Number(src.attributes?.defesa?.base ?? sys.attributes?.defesa?.base) || 0
		},
		pv: {
			value: Number(src.attributes?.pv?.value ?? sys.attributes?.pv?.value) || 0,
			max: Number(src.attributes?.pv?.max ?? sys.attributes?.pv?.max) || 0
		},
		pm: {
			value: Number(src.attributes?.pm?.value ?? sys.attributes?.pm?.value) || 0,
			max: Number(src.attributes?.pm?.max ?? sys.attributes?.pm?.max) || 0
		},
		cd: Number(src.attributes?.cd ?? sys.attributes?.cd) || 0,
		skills,
		detalhes: {
			ataquescac: src.detalhes?.ataquescac ?? "",
			ataquesad: src.detalhes?.ataquesad ?? "",
			tesouro: src.detalhes?.tesouro ?? ""
		},
		items: actor.items.map((i) => ({ _id: i.id, name: i.name, type: i.type, system: i.toObject().system })),
		rollData: actor.getRollData()
	};
}

export function planFor(actor, options) {
	return computePlan(snapshotActor(actor), options);
}

/** Aplica um plano a um ator (o original ou uma cópia com os mesmos IDs de itens). */
export async function applyPlan(actor, plan) {
	const update = foundry.utils.deepClone(plan.actorUpdate);
	update[`flags.${MODULE_ID}.history`] = [
		...(actor.getFlag(MODULE_ID, "history") ?? []),
		{ from: plan.from.nd, to: plan.to.nd, role: plan.to.role, date: Date.now() }
	];
	for (const key of legacySkillKeys(actor._source?.system?.pericias)) update[`system.pericias.-=${key}`] = null;
	await actor.update(update);
	const ids = new Set(actor.items.map((i) => i.id));
	const items = plan.itemUpdates.filter((u) => ids.has(u._id));
	if (items.length) await actor.updateEmbeddedDocuments("Item", items);
	return actor;
}

/** Cria uma cópia do ator (na mesma pasta) e aplica o plano nela. */
export async function copyAndApply(actor, plan) {
	const data = actor.toObject();
	delete data._id;
	for (const key of legacySkillKeys(data.system?.pericias)) delete data.system.pericias[key];
	const name = game.i18n.format("T20ESC.CopyName", { name: actor.name, nd: plan.to.nd });
	data.name = name;
	if (data.prototypeToken) data.prototypeToken.name = name;
	if (actor.isToken) data.folder = null;
	foundry.utils.setProperty(data, `flags.${MODULE_ID}.source`, actor.uuid);
	const copy = await Actor.implementation.create(data, { keepEmbeddedIds: true });
	await applyPlan(copy, plan);
	return copy;
}

/** API pública: escala sem abrir a janela. */
export async function scaleActor(actor, targetND, { role, damageMode, statsMode, updateText, copy = false } = {}) {
	const plan = planFor(actor, { targetND: String(targetND), role, damageMode, statsMode, updateText });
	return copy ? copyAndApply(actor, plan) : applyPlan(actor, plan);
}

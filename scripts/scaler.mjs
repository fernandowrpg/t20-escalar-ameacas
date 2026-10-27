/**
 * Lógica de escala de ameaças (sem dependência do Foundry, para poder ser testada).
 *
 * Segue "Como Modificar Criaturas" (Ameaças de Arton): para cada estatística de
 * combate, mantém a diferença entre o valor da ficha e o valor da tabela do ND
 * original, aplicando-a sobre a tabela do novo ND. O dano dos ataques é ajustado
 * para o dano médio da tabela e as habilidades têm dano e CD ajustados.
 */
import {
	ndIndex, rowAt, normalizeRole, ndLevel, ndNumber, patamar, PATAMAR_ORDER, halfLevel, trainingBonus
} from "./tables.mjs";
import { averageParts, averageFormula, rescaleParts, parseFormula, normalizeFormula, isDamagePart } from "./formula.mjs";

const SAVES = ["fort", "refl", "vont"];
const ATTACK_SKILLS = ["luta", "pont"];

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signed(n) {
	return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Atualiza números em um texto (descrição de habilidade, linha de ataques, tesouro).
 * @param {string} text
 * @param {object} ctx {formulaMap: [old,new][], ratio, rollData, dCD, dND, dAtk}
 */
export function updateText(text, ctx) {
	if (!text || typeof text !== "string") return text;
	const store = [];
	const hold = (s) => {
		store.push(s);
		return `\u0000${store.length - 1}\u0000`;
	};
	const map = new Map();
	for (const [o, n] of ctx.formulaMap ?? []) {
		if (o && n && normalizeFormula(o) !== normalizeFormula(n)) map.set(normalizeFormula(o), n);
	}
	const scale = (f) => {
		const key = normalizeFormula(f);
		if (map.has(key)) return map.get(key);
		if (!ctx.ratio || ctx.ratio === 1) return null;
		const p = parseFormula(f);
		if (!p.ok || !p.terms.some((t) => t.kind === "dice")) return null;
		const avg = averageFormula(f, ctx.rollData);
		const r = rescaleParts([[f, "", ""]], Math.max(1, Math.round(avg * ctx.ratio)), ctx.rollData);
		return r.ok ? r.parts[0][0] : null;
	};

	let out = text;

	// 1) Rolagens inline: [[/r 2d6+3]] ou [[2d6+3]]
	out = out.replace(/\[\[(\/(?:r|roll|gmr|br|sr|damage)\s+)?([^\]#]+?)(#[^\]]*)?\]\](\{[^}]*\})?/gi, (m, cmd, f, flavor, label) => {
		const n = scale(f.trim());
		return hold(n ? `[[${cmd ?? ""}${n}${flavor ?? ""}]]${label ?? ""}` : m);
	});

	// 2) Fórmulas conhecidas (rolagens que foram reescaladas), da mais longa para a mais curta.
	const keys = [...map.keys()].sort((a, b) => b.length - a.length);
	for (const key of keys) {
		const pattern = key.split("").map((ch) => (/[+-]/.test(ch) ? "\\s*[+\\-−–]\\s*" : escapeRegExp(ch))).join("");
		const re = new RegExp(`(?<![\\dd])${pattern}(?![\\d])`, "gi");
		out = out.replace(re, () => hold(map.get(key)));
	}

	// 3) Outras fórmulas de dano em texto ("2d6+10 pontos de dano").
	if (ctx.ratio && ctx.ratio !== 1) {
		out = out.replace(/(?<![\dd])(\d+d\d+(?:\s*[+\-−–]\s*\d+)?)(?=(?:\s|&nbsp;)+(?:pontos(?:\s|&nbsp;)+de(?:\s|&nbsp;)+)?dano)/gi, (m, f) => {
			const n = scale(f);
			return n ? hold(n) : m;
		});
	}

	// 4) CDs. "CD X para extrair" segue 15 + ND; as demais seguem a CD de efeito.
	const sp = "(?:\\s|&nbsp;)+";
	if (ctx.dND) {
		out = out.replace(new RegExp(`(CD${sp}para${sp}extrair${sp})(\\d+)`, "gi"), (m, pre, n) => hold(`${pre}${Math.max(0, Math.round(Number(n) + ctx.dND))}`));
		out = out.replace(new RegExp(`(CD${sp})(\\d+)(${sp}para${sp}extrair)`, "gi"), (m, pre, n, post) => hold(`${pre}${Math.max(0, Math.round(Number(n) + ctx.dND))}${post}`));
	}
	if (ctx.dCD) {
		out = out.replace(new RegExp(`(\\bCD${sp})(\\d+)`, "g"), (m, pre, n) => `${pre}${Number(n) + ctx.dCD}`);
	}

	// 5) Testes de manobra ("teste +22") acompanham o ataque.
	if (ctx.dAtk) {
		out = out.replace(/(teste(?:\s|&nbsp;)*)([+\-−–])(\d+)/gi, (m, pre, s, n) => {
			const v = (/[-−–]/.test(s) ? -1 : 1) * Number(n) + ctx.dAtk;
			return `${pre}${signed(v)}`;
		});
	}

	return out.replace(/\u0000(\d+)\u0000/g, (m, i) => store[Number(i)]);
}

/**
 * @typedef {object} ThreatSnapshot
 * @property {string} name
 * @property {string} nd
 * @property {string} role
 * @property {{value:number, base:number}} defesa
 * @property {{value:number, max:number}} pv
 * @property {{value:number, max:number}} pm
 * @property {number} cd
 * @property {Object<string,{value:number, outros:number, treinado:boolean, label?:string}>} skills
 * @property {{ataquescac?:string, ataquesad?:string, tesouro?:string}} detalhes
 * @property {Array<{_id:string, name:string, type:string, system:object}>} items
 * @property {object} rollData
 */

/**
 * Calcula todas as mudanças necessárias para levar a ameaça a um novo ND.
 * @param {ThreatSnapshot} snap
 * @param {{targetND:string, role?:string, damageMode?:"table"|"proportional", updateText?:boolean}} options
 */
export function computePlan(snap, options) {
	const warnings = [];
	const changes = [];
	const actorUpdate = {};
	const itemUpdates = new Map();
	const change = (section, label, from, to) => changes.push({ section, label, from: String(from), to: String(to), changed: String(from) !== String(to) });
	const itemUpdate = (id) => {
		if (!itemUpdates.has(id)) itemUpdates.set(id, { _id: id });
		return itemUpdates.get(id);
	};

	const fromND = String(snap.nd);
	const toND = String(options.targetND);
	const snapRole = normalizeRole(snap.role);
	let role = normalizeRole(options.role) ?? snapRole;
	if (!role) {
		warnings.push("roleMissing");
		role = "solo";
	}
	const oldIdx = ndIndex(fromND);
	const newIdx = ndIndex(toND);
	if (oldIdx < 0) throw new Error(`ND inválido na ficha: ${fromND}`);
	if (newIdx < 0) throw new Error(`ND de destino inválido: ${toND}`);
	const damageMode = options.damageMode ?? "table";
	const doText = options.updateText !== false;
	const rollData = snap.rollData ?? {};

	const To = rowAt(role, oldIdx);
	const Tn = rowAt(role, newIdx);
	const To2 = rowAt(role, oldIdx - 2);
	const Tn2 = rowAt(role, newIdx - 2);
	const dHalf = halfLevel(toND) - halfLevel(fromND);
	const dTrain = trainingBonus(toND) - trainingBonus(fromND);
	const autoDelta = (skill) => dHalf + (skill?.treinado ? dTrain : 0);

	const result = {
		from: { nd: fromND, role: snapRole ?? "", patamar: patamar(fromND), table: To },
		to: { nd: toND, role, patamar: patamar(toND), table: Tn },
		actorUpdate,
		itemUpdates: [],
		changes,
		warnings
	};

	// --- Geral --------------------------------------------------------------
	actorUpdate["system.attributes.nd"] = toND;
	change("general", "ND", fromND, toND);
	if (role !== snap.role) {
		actorUpdate["system.detalhes.role"] = role;
		change("general", "role", snap.role || "—", role);
	}
	const pOld = PATAMAR_ORDER.indexOf(patamar(fromND));
	const pNew = PATAMAR_ORDER.indexOf(patamar(toND));
	if (pOld !== pNew) {
		change("general", "patamar", patamar(fromND), patamar(toND));
		warnings.push(pNew > pOld ? "tierUp" : "tierDown");
	}

	// --- Defesa, PV, PM, CD ------------------------------------------------
	const dDef = Tn.defesa - To.defesa;
	if (snap.defesa) {
		actorUpdate["system.attributes.defesa.base"] = (Number(snap.defesa.base) || 0) + dDef;
		change("defense", "defesa", snap.defesa.value, (Number(snap.defesa.value) || 0) + dDef);
	}

	if (snap.pv) {
		const oldMax = Number(snap.pv.max) || 0;
		const ratio = Tn.pv / To.pv;
		const newMax = Math.max(1, Math.round(oldMax * ratio));
		const oldVal = Number(snap.pv.value) || 0;
		const newVal = oldVal >= oldMax ? newMax : Math.max(0, Math.round(oldVal * ratio));
		actorUpdate["system.attributes.pv.max"] = newMax;
		actorUpdate["system.attributes.pv.value"] = newVal;
		change("defense", "pv", oldMax, newMax);
	}

	if (snap.pm && Number(snap.pm.max) > 0) {
		const oldMax = Number(snap.pm.max);
		const newMax = Math.max(0, oldMax + 3 * (ndLevel(toND) - ndLevel(fromND)));
		const oldVal = Number(snap.pm.value) || 0;
		actorUpdate["system.attributes.pm.max"] = newMax;
		actorUpdate["system.attributes.pm.value"] = oldVal >= oldMax ? newMax : Math.min(newMax, oldVal);
		change("defense", "pm", oldMax, newMax);
	}

	const dCD = Tn.cd - To.cd;
	// CD 10 é o valor padrão do sistema (ficha sem CD definida): usa a tabela.
	const oldCD = Number(snap.cd) || 0;
	const newCD = oldCD <= 10 ? Tn.cd : oldCD + dCD;
	actorUpdate["system.attributes.cd"] = newCD;
	change("abilities", "cd", oldCD, newCD);

	// --- Testes de resistência --------------------------------------------
	const saveKeys = SAVES.filter((k) => snap.skills?.[k]);
	const ranked = [...saveKeys].sort((a, b) => (snap.skills[b].value ?? 0) - (snap.skills[a].value ?? 0));
	const rankDelta = [Tn.forte - To.forte, Tn.media - To.media, Tn.fraca - To.fraca];
	const rankName = ["forte", "média", "fraca"];
	ranked.forEach((key, i) => {
		const s = snap.skills[key];
		const delta = rankDelta[i];
		actorUpdate[`system.pericias.${key}.outros`] = (Number(s.outros) || 0) + delta - autoDelta(s);
		change("saves", s.label || key, signed(s.value), `${signed(s.value + delta)} (${rankName[i]})`);
	});

	// --- Ataques -----------------------------------------------------------
	const weapons = [];
	for (const item of snap.items ?? []) {
		if (item.type !== "arma") continue;
		const rolls = item.system?.rolls ?? [];
		const atk = rolls.find((r) => r.type === "ataque");
		const dmgRolls = rolls.filter((r) => r.type === "dano");
		if (!atk && !dmgRolls.length) continue;
		const skill = atk?.parts?.[1]?.[0] || "";
		const proposito = item.system?.proposito ?? "";
		const group = skill === "pont" || (!skill && ["disparo", "arremesso"].includes(proposito)) ? "ranged" : "melee";
		const count = Number(item.system?.qtd) > 1 ? Number(item.system.qtd) : 1;
		const avg = dmgRolls.length ? averageParts(dmgRolls[0].parts, rollData) : 0;
		let constant = 0;
		for (const p of atk?.parts?.slice(2) ?? []) constant += averageFormula(p?.[0] ?? p, rollData) ?? 0;
		const attack = atk ? (skill ? (snap.skills?.[skill]?.value ?? 0) : 0) + constant : null;
		weapons.push({ item, atk, dmgRolls, skill, group, count, avg, attack });
	}

	const groups = { melee: [], ranged: [] };
	weapons.forEach((w) => groups[w.group].push(w));
	const total = (g) => groups[g].reduce((s, w) => s + (w.avg ?? 0) * w.count, 0);
	const primary = !groups.melee.length ? "ranged" : !groups.ranged.length ? "melee" : total("ranged") > total("melee") ? "ranged" : "melee";
	const groupInfo = {};
	for (const g of ["melee", "ranged"]) {
		if (!groups[g].length) continue;
		const isPrimary = g === primary;
		const tOld = isPrimary ? To : To2;
		const tNew = isPrimary ? Tn : Tn2;
		const current = total(g);
		const target = damageMode === "table" ? tNew.dano : Math.round(current * (tNew.dano / tOld.dano));
		groupInfo[g] = { isPrimary, dAtk: tNew.ataque - tOld.ataque, current, target };
		change("attacks", isPrimary ? "damagePrimary" : "damageSecondary", current, target);
	}

	// Perícias de ataque (Luta / Pontaria) — o ataque das armas deriva delas.
	const dAtkPrimary = Tn.ataque - To.ataque;
	const skillAtkDelta = {};
	for (const key of ATTACK_SKILLS) {
		const s = snap.skills?.[key];
		if (!s) continue;
		const used = weapons.filter((w) => w.skill === key);
		if (!used.length && !s.treinado) continue;
		const delta = used.length ? groupInfo[used[0].group].dAtk : dAtkPrimary;
		skillAtkDelta[key] = delta;
		actorUpdate[`system.pericias.${key}.outros`] = (Number(s.outros) || 0) + delta - autoDelta(s);
		change("attacks", s.label || key, signed(s.value), signed(s.value + delta));
	}

	const attackTextMaps = { melee: [], ranged: [] };
	for (const w of weapons) {
		const info = groupInfo[w.group];
		const upd = itemUpdate(w.item._id);
		const rolls = foundry_deepClone(w.item.system.rolls);
		let newAttack = w.attack;

		if (w.atk) {
			if (w.skill && skillAtkDelta[w.skill] !== undefined) {
				newAttack = w.attack + skillAtkDelta[w.skill];
			} else if (w.skill && snap.skills?.[w.skill]) {
				// Ataque baseado em outra perícia: ajusta o bônus fixo.
				newAttack = w.attack + info.dAtk;
				const r = rolls.find((x) => x.type === "ataque");
				const extra = info.dAtk - autoDelta(snap.skills[w.skill]);
				bumpConstant(r, extra, rollData);
			} else {
				newAttack = w.attack + info.dAtk;
				const r = rolls.find((x) => x.type === "ataque");
				bumpConstant(r, info.dAtk, rollData);
			}
		}

		const formulaPairs = [];
		const groupTotal = info.current;
		const perAttack = groupTotal > 0
			? info.target * ((w.avg ?? 0) / groupTotal)
			: info.target / groups[w.group].reduce((s, x) => s + x.count, 0);
		let newDamageText = "";
		w.dmgRolls.forEach((dr, idx) => {
			const r = rolls.find((x) => x.key === dr.key && x.type === "dano") ?? rolls.filter((x) => x.type === "dano")[idx];
			if (!dr.parts?.some(isDamagePart)) return;
			const curAvg = averageParts(dr.parts, rollData);
			if (curAvg === null) {
				warnings.push(`formula:${w.item.name}`);
				return;
			}
			const target = idx === 0 ? perAttack : curAvg * (w.avg ? perAttack / w.avg : 1);
			const res = rescaleParts(dr.parts, target, rollData);
			if (!res.ok) {
				warnings.push(`formula:${w.item.name}`);
				return;
			}
			r.parts = res.parts;
			dr.parts.forEach((p, i) => formulaPairs.push([p[0], res.parts[i][0]]));
			if (idx === 0) {
				newDamageText = res.parts.filter((p) => String(p[0]).trim()).map((p) => p[0]).join(" + ");
			}
		});
		upd["system.rolls"] = rolls;
		attackTextMaps[w.group].push({ oldAttack: w.attack, newAttack, formulaPairs });

		const oldDamageText = (w.dmgRolls[0]?.parts ?? []).filter((p) => String(p[0]).trim()).map((p) => p[0]).join(" + ");
		const countTxt = w.count > 1 ? ` ×${w.count}` : "";
		const fromTxt = `${w.attack !== null ? signed(w.attack) + " " : ""}(${oldDamageText || "—"})${countTxt}`;
		const toTxt = `${newAttack !== null ? signed(newAttack) + " " : ""}(${newDamageText || oldDamageText || "—"})${countTxt}`;
		change("attacks", w.item.name, fromTxt, toTxt);

		if (doText) {
			const desc = w.item.system?.description?.value;
			const newDesc = updateText(desc, { formulaMap: formulaPairs, rollData, dCD, dAtk: info.dAtk, dND: ndNumber(toND) - ndNumber(fromND) });
			if (newDesc !== desc) upd["system.description.value"] = newDesc;
		}
	}

	// --- Habilidades (poderes e demais itens com dano) ---------------------
	const ratio = Tn.dano / To.dano;
	const dND = ndNumber(toND) - ndNumber(fromND);
	for (const item of snap.items ?? []) {
		if (item.type === "arma" || item.type === "magia") continue;
		const rolls = item.system?.rolls ?? [];
		const pairs = [];
		let newRolls = null;
		rolls.forEach((r, i) => {
			if (r.type !== "dano") return;
			const avg = averageParts(r.parts, rollData);
			if (avg === null) {
				warnings.push(`formula:${item.name}`);
				return;
			}
			if (avg <= 0) return;
			const res = rescaleParts(r.parts, Math.max(1, Math.round(avg * ratio)), rollData);
			if (!res.ok) return;
			newRolls ??= foundry_deepClone(rolls);
			newRolls[i].parts = res.parts;
			r.parts.forEach((p, j) => pairs.push([p[0], res.parts[j][0]]));
			const o = r.parts.filter((p) => String(p[0]).trim()).map((p) => p[0]).join(" + ");
			const n = res.parts.filter((p) => String(p[0]).trim()).map((p) => p[0]).join(" + ");
			change("abilities", `${item.name}${r.name && r.name !== "Dano" ? ` (${r.name})` : ""}`, `${o} [${avg}]`, `${n} [${res.newAvg}]`);
		});
		if (newRolls) itemUpdate(item._id)["system.rolls"] = newRolls;

		if (doText) {
			const desc = item.system?.description?.value;
			const newDesc = updateText(desc, { formulaMap: pairs, ratio, rollData, dCD, dAtk: dAtkPrimary, dND });
			if (newDesc !== desc) {
				itemUpdate(item._id)["system.description.value"] = newDesc;
				if (!newRolls) change("text", item.name, "", "");
			}
		}
	}
	if ((snap.items ?? []).some((i) => i.type === "magia")) warnings.push("spells");

	// --- Perícias (ajustadas automaticamente pelo sistema via ½ ND e treino) -
	for (const [key, s] of Object.entries(snap.skills ?? {})) {
		if (SAVES.includes(key) || skillAtkDelta[key] !== undefined) continue;
		if (!s.treinado) continue;
		change("skills", s.label || key, signed(s.value), signed(s.value + autoDelta(s)));
	}
	change("skills", "untrained", signed(0), signed(dHalf));

	// --- Textos da ficha ---------------------------------------------------
	if (doText) {
		for (const [field, group] of [["ataquescac", "melee"], ["ataquesad", "ranged"]]) {
			const txt = snap.detalhes?.[field];
			if (!txt) continue;
			let out = txt;
			const entries = attackTextMaps[group];
			const atkMap = new Map(entries.filter((e) => e.oldAttack !== null).map((e) => [e.oldAttack, e.newAttack]));
			out = out.replace(/([+\-−–])(\d+)(?=\s*\()/g, (m, s, n) => {
				const v = (/[-−–]/.test(s) ? -1 : 1) * Number(n);
				return atkMap.has(v) ? signed(atkMap.get(v)) : m;
			});
			out = updateText(out, {
				formulaMap: entries.flatMap((e) => e.formulaPairs),
				rollData,
				dCD,
				dND
			});
			if (out !== txt) {
				actorUpdate[`system.detalhes.${field}`] = out;
				change("text", field, txt, out);
			}
		}
		const tesouro = snap.detalhes?.tesouro;
		if (tesouro) {
			const out = updateText(tesouro, { dND });
			if (out !== tesouro) {
				actorUpdate["system.detalhes.tesouro"] = out;
				change("text", "tesouro", tesouro, out);
			}
		}
	}

	result.itemUpdates = [...itemUpdates.values()].filter((u) => Object.keys(u).length > 1);
	return result;
}

function bumpConstant(roll, delta, rollData) {
	if (!roll || !delta) return;
	roll.parts ??= [];
	while (roll.parts.length < 3) roll.parts.push(["", "", ""]);
	const p = roll.parts[2];
	const cur = averageFormula(p[0] || "0", rollData);
	if (cur !== null && parseFormula(p[0] || "0").terms.every((t) => t.kind === "num")) p[0] = String(cur + delta);
	else p[0] = `${p[0]}${delta >= 0 ? "+" : ""}${delta}`;
}

function foundry_deepClone(obj) {
	return obj === undefined ? obj : JSON.parse(JSON.stringify(obj));
}

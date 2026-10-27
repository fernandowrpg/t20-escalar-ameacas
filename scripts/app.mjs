import { ND_LIST, ROLES, patamar, normalizeRole } from "./tables.mjs";
import { MODULE_ID, planFor, applyPlan, copyAndApply } from "./foundry-adapter.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SECTIONS = ["general", "defense", "saves", "attacks", "abilities", "skills", "text"];

function loc(key, fallback) {
	return game.i18n.has(key) ? game.i18n.localize(key) : fallback ?? key;
}

export class ScaleThreatApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(actor, options = {}) {
		super({ ...options, id: `${MODULE_ID}-${actor.uuid.replace(/\./g, "-")}` });
		this.actor = actor;
		const current = String(actor._source.system?.attributes?.nd ?? actor.system.attributes?.nd ?? "1");
		const idx = Math.max(0, ND_LIST.indexOf(current));
		const role = normalizeRole(actor._source.system?.detalhes?.role);
		this.state = {
			targetND: ND_LIST[Math.min(ND_LIST.length - 1, idx + 1)],
			role: role ?? "solo",
			damageMode: game.settings.get(MODULE_ID, "damageMode"),
			updateText: game.settings.get(MODULE_ID, "updateText")
		};
	}

	static DEFAULT_OPTIONS = {
		classes: ["t20esc-app"],
		tag: "form",
		window: { icon: "fa-solid fa-arrow-up-right-dots", resizable: true, contentClasses: ["standard-form"] },
		position: { width: 680, height: 760 },
		form: { submitOnChange: false, closeOnSubmit: false },
		actions: {
			apply: ScaleThreatApp.#onApply,
			copy: ScaleThreatApp.#onCopy,
			cancel: ScaleThreatApp.#onCancel
		}
	};

	static PARTS = {
		form: { template: `modules/${MODULE_ID}/templates/scale-dialog.hbs`, scrollable: [".t20esc-preview"] }
	};

	get title() {
		return `${game.i18n.localize("T20ESC.Title")}: ${this.actor.name}`;
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		let plan;
		let error = null;
		try {
			plan = planFor(this.actor, this.state);
		} catch (err) {
			console.error(`${MODULE_ID} |`, err);
			error = err.message;
		}
		this.plan = plan;

		const tierLabel = (t) => loc(`T20ESC.Tier.${t}`, t);
		const roleLabel = (r) => loc(`T20ESC.Role.${r}`, r || "—");
		const current = String(this.actor._source.system?.attributes?.nd ?? "1");

		const sections = [];
		if (plan) {
			for (const key of SECTIONS) {
				const rows = plan.changes
					.filter((c) => c.section === key)
					.map((c) => {
						let from = c.from;
						let to = c.to;
						if (c.label === "patamar") {
							from = tierLabel(from);
							to = tierLabel(to);
						} else if (c.label === "role") {
							from = roleLabel(from);
							to = roleLabel(to);
						}
						return {
							label: loc(`T20ESC.Label.${c.label}`, c.label),
							from,
							to,
							changed: c.changed,
							long: key === "text",
							textOnly: key === "text" && !c.from && !c.to
						};
					});
				if (rows.length) sections.push({ key, label: loc(`T20ESC.Section.${key}`), rows });
			}
		}

		const warnings = (plan?.warnings ?? []).map((w) => {
			if (w.startsWith("formula:")) return game.i18n.format("T20ESC.Warn.formula", { name: w.slice(8) });
			return loc(`T20ESC.Warn.${w}`, w);
		});

		return Object.assign(context, {
			actor: this.actor,
			img: this.actor.img,
			current: { nd: current, tier: tierLabel(patamar(current)), role: roleLabel(normalizeRole(this.actor._source.system?.detalhes?.role) ?? "") },
			target: plan ? { nd: plan.to.nd, tier: tierLabel(plan.to.patamar), role: roleLabel(plan.to.role) } : null,
			ndOptions: ND_LIST.map((nd) => ({ value: nd, label: nd, selected: nd === this.state.targetND, current: nd === current })),
			roleOptions: ROLES.map((r) => ({ value: r, label: roleLabel(r), selected: r === this.state.role })),
			damageOptions: ["table", "proportional"].map((m) => ({
				value: m,
				label: loc(`T20ESC.DamageMode.${m}`),
				selected: m === this.state.damageMode
			})),
			updateText: this.state.updateText,
			sameND: current === this.state.targetND,
			table: plan ? { from: plan.from.table, to: plan.to.table } : null,
			sections,
			warnings,
			error
		});
	}

	_onFirstRender(context, options) {
		super._onFirstRender?.(context, options);
		this.element.addEventListener("change", (event) => {
			const el = event.target;
			if (!el?.name) return;
			if (el.name === "updateText") this.state.updateText = el.checked;
			else if (el.name in this.state) this.state[el.name] = el.value;
			this.render();
		});
	}

	async #run(copy) {
		if (!this.plan) return;
		try {
			if (copy) {
				const created = await copyAndApply(this.actor, this.plan);
				ui.notifications.info(game.i18n.format("T20ESC.Notify.copied", { name: created.name, nd: this.plan.to.nd }));
				if (game.settings.get(MODULE_ID, "openCopy")) created.sheet?.render(true);
			} else {
				await applyPlan(this.actor, this.plan);
				ui.notifications.info(game.i18n.format("T20ESC.Notify.applied", { name: this.actor.name, nd: this.plan.to.nd }));
			}
			this.close();
		} catch (err) {
			console.error(`${MODULE_ID} |`, err);
			ui.notifications.error(game.i18n.format("T20ESC.Notify.error", { error: err.message }));
		}
	}

	static async #onApply(event) {
		event.preventDefault();
		const ok = await foundry.applications.api.DialogV2.confirm({
			window: { title: game.i18n.localize("T20ESC.ConfirmTitle") },
			content: `<p>${game.i18n.format("T20ESC.ConfirmApply", { name: foundry.utils.escapeHTML?.(this.actor.name) ?? this.actor.name, nd: this.state.targetND })}</p>`
		});
		if (ok) await this.#run(false);
	}

	static async #onCopy(event) {
		event.preventDefault();
		await this.#run(true);
	}

	static #onCancel(event) {
		event.preventDefault();
		this.close();
	}
}

export function openScaleDialog(actor) {
	if (!actor || actor.type !== "npc") {
		ui.notifications.warn(game.i18n.localize("T20ESC.Notify.npcOnly"));
		return null;
	}
	const existing = foundry.applications.instances?.get(`${MODULE_ID}-${actor.uuid.replace(/\./g, "-")}`);
	if (existing) {
		existing.bringToFront?.();
		return existing;
	}
	const app = new ScaleThreatApp(actor);
	app.render(true);
	return app;
}

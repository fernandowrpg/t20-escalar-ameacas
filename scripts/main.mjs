import { MODULE_ID, planFor, applyPlan, copyAndApply, scaleActor } from "./foundry-adapter.mjs";
import { ScaleThreatApp, openScaleDialog } from "./app.mjs";
import { computePlan } from "./scaler.mjs";
import * as tables from "./tables.mjs";

const canScale = (actor) => actor?.type === "npc" && actor.isOwner;

Hooks.once("init", () => {
	game.settings.register(MODULE_ID, "damageMode", {
		name: "T20ESC.Settings.damageMode.name",
		hint: "T20ESC.Settings.damageMode.hint",
		scope: "world",
		config: true,
		type: String,
		choices: {
			table: "T20ESC.DamageMode.table",
			proportional: "T20ESC.DamageMode.proportional"
		},
		default: "table"
	});
	game.settings.register(MODULE_ID, "updateText", {
		name: "T20ESC.Settings.updateText.name",
		hint: "T20ESC.Settings.updateText.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});
	game.settings.register(MODULE_ID, "openCopy", {
		name: "T20ESC.Settings.openCopy.name",
		hint: "T20ESC.Settings.openCopy.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true
	});

	const module = game.modules.get(MODULE_ID);
	module.api = { open: openScaleDialog, scaleActor, planFor, applyPlan, copyAndApply, computePlan, tables, ScaleThreatApp };
});

Hooks.once("ready", () => {
	if (game.system.id !== "tormenta20") {
		console.warn(`${MODULE_ID} | Este módulo foi feito para o sistema Tormenta20 (atual: ${game.system.id}).`);
	}
});

/* Botão no cabeçalho das fichas AppV1 (fichas de NPC do T20 1.5.x). */
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
	const actor = sheet.actor ?? sheet.document;
	if (!canScale(actor)) return;
	buttons.unshift({
		label: game.i18n.localize("T20ESC.Button"),
		class: "t20esc-open",
		icon: "fa-solid fa-arrow-up-right-dots",
		onclick: () => openScaleDialog(actor)
	});
});

/* Botão no menu do cabeçalho das fichas AppV2 (caso o sistema migre suas fichas). */
Hooks.on("getHeaderControlsActorSheetV2", (sheet, controls) => {
	const actor = sheet.actor ?? sheet.document;
	if (!canScale(actor)) return;
	const action = "t20escScale";
	sheet.options.actions ??= {};
	sheet.options.actions[action] = () => openScaleDialog(actor);
	controls.push({
		action,
		icon: "fa-solid fa-arrow-up-right-dots",
		label: "T20ESC.Button",
		onClick: () => openScaleDialog(actor)
	});
});

/* Menu de contexto do diretório de atores. */
Hooks.on("getActorContextOptions", (app, options) => {
	const getActor = (li) => {
		const el = li instanceof HTMLElement ? li : li?.[0];
		const id = el?.dataset?.entryId ?? el?.dataset?.documentId;
		return game.actors.get(id);
	};
	options.push({
		name: "T20ESC.Button",
		label: "T20ESC.Button",
		icon: '<i class="fa-solid fa-arrow-up-right-dots"></i>',
		condition: (li) => canScale(getActor(li)),
		callback: (li) => openScaleDialog(getActor(li))
	});
});

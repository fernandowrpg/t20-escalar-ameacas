import { test } from "node:test";
import assert from "node:assert/strict";
import { averageFormula, rescaleParts, parseFormula } from "../scripts/formula.mjs";
import { computePlan, updateText } from "../scripts/scaler.mjs";

const weapon = (id, name, formula, qtd = 0, skill = "luta") => ({
	_id: id,
	name,
	type: "arma",
	system: {
		qtd,
		proposito: "corpo-a-corpo",
		description: { value: "" },
		rolls: [
			{ name: "Ataque", key: "ataque0", type: "ataque", parts: [["1d20", "", ""], [skill, "", ""], ["0", "", ""]] },
			{ name: "Dano", key: "dano1", type: "dano", parts: [[formula, "corte", ""], ["", "", ""]] }
		]
	}
});

const skill = (value, outros, treinado = false) => ({ value, outros, treinado });

function manticora() {
	return {
		name: "Mantícora",
		nd: "6",
		role: "solo",
		defesa: { value: 26, base: 24 },
		pv: { value: 240, max: 240 },
		pm: { value: 0, max: 0 },
		cd: 22,
		skills: {
			fort: skill(18, 10),
			refl: skill(7, 2),
			vont: skill(12, 8),
			luta: skill(18, 6, true),
			pont: skill(5, 0),
			perc: skill(8, 2, true),
			inic: skill(7, 0, true),
			atle: skill(10, 0)
		},
		detalhes: {
			ataquescac: "Mordida +18 (1d10+12) e duas garras +18 (1d8+12).",
			tesouro: "Padrão mais espinhos (CD 21 para extrair)."
		},
		items: [
			weapon("w1", "Mordida", "1d10+12"),
			weapon("w2", "Garras", "1d8+12", 2),
			{
				_id: "p1",
				name: "Espinhos",
				type: "poder",
				system: {
					description: {
						value: "Cada espinho causa 1d8+7 pontos de dano de perfuração (Ref CD 22 reduz à metade)."
					},
					rolls: [{ name: "Dano", key: "dano0", type: "dano", parts: [["1d8+7", "perfuracao", ""]] }]
				}
			}
		],
		rollData: { for: 7, des: 2 }
	};
}

test("média segue a regra do livro", () => {
	assert.equal(averageFormula("2d6+2"), 9);
	assert.equal(averageFormula("1d4+6"), 8);
	assert.equal(averageFormula("1d8+@for", { for: 4 }), 8);
	assert.equal(averageFormula("padrao", { for: 3 }), 3);
	assert.equal(parseFormula("(1d6+2)*2").ok, false);
});

test("reescala dano para a média alvo", () => {
	for (const [f, t] of [["1d10+12", 50], ["1d8+12", 5], ["2d6", 30], ["1d4", 1], ["4d12+40", 17]]) {
		const r = rescaleParts([[f, "corte", ""]], t);
		assert.ok(r.ok, f);
		assert.equal(r.newAvg, t, `${f} -> ${r.parts[0][0]}`);
	}
	// Partes extras acompanham a proporção
	const r = rescaleParts([["1d8+10", "impacto", ""], ["1d8", "acido", ""]], 38);
	assert.equal(r.newAvg, 38);
	assert.equal(r.parts[1][0], "2d8");
});

test("mantícora ND 6 → ND 12 (solo)", () => {
	const plan = computePlan(manticora(), { targetND: "12" });
	const u = plan.actorUpdate;
	assert.equal(u["system.attributes.nd"], "12");
	assert.equal(u["system.attributes.defesa.base"], 24 + 16);
	assert.equal(u["system.attributes.pv.max"], 600);
	assert.equal(u["system.attributes.cd"], 33);
	// Luta: 18 + 16 = 34; sistema já soma +3 (½ND) +2 (treino) → outros = 6 + 16 - 5
	assert.equal(u["system.pericias.luta.outros"], 17);
	// Fort forte 18 → 26; ½ND +3 automático
	assert.equal(u["system.pericias.fort.outros"], 10 + 8 - 3);
	assert.equal(u["system.pericias.vont.outros"], 8 + 8 - 3);
	assert.equal(u["system.pericias.refl.outros"], 2 + 6 - 3);

	const mord = plan.itemUpdates.find((i) => i._id === "w1")["system.rolls"][1].parts[0][0];
	const garra = plan.itemUpdates.find((i) => i._id === "w2")["system.rolls"][1].parts[0][0];
	const total = averageFormula(mord) + 2 * averageFormula(garra);
	assert.ok(Math.abs(total - 144) <= 2, `total ${total}`);

	assert.match(u["system.detalhes.ataquescac"], /Mordida \+34 \(\dd10\+\d+\) e duas garras \+34/);
	assert.match(u["system.detalhes.tesouro"], /CD 27 para extrair/);

	const esp = plan.itemUpdates.find((i) => i._id === "p1");
	assert.match(esp["system.description.value"], /CD 33/);
	assert.ok(!esp["system.description.value"].includes("1d8+7"));
	assert.ok(plan.warnings.includes("tierUp"));
});

test("escala para baixo mantém valores válidos", () => {
	const plan = computePlan(manticora(), { targetND: "1/4" });
	const u = plan.actorUpdate;
	assert.equal(u["system.attributes.pv.max"], 7);
	assert.equal(u["system.attributes.defesa.base"], 24 - 16);
	const mord = plan.itemUpdates.find((i) => i._id === "w1")["system.rolls"][1].parts[0][0];
	assert.ok(averageFormula(mord) >= 1, mord);
});

test("updateText ajusta CD, testes e rolagens inline", () => {
	const out = updateText("Agarrar (teste +22). Fort CD&nbsp;22 evita. Sofre [[/r 2d6+10]] de ácido.", {
		dCD: 5, dAtk: 4, ratio: 2, rollData: {}
	});
	assert.match(out, /teste \+26/);
	assert.match(out, /CD&nbsp;27/);
	assert.ok(!out.includes("2d6+10"));
});

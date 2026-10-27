/**
 * Utilitários para ler, calcular a média e reescalar fórmulas de dano simples
 * (ex.: "2d6+5", "1d8+@for", "padrao"). Fórmulas com parênteses, multiplicação
 * ou modificadores de dados são consideradas não ajustáveis.
 */

const DIE_STEPS = [2, 3, 4, 6, 8, 10, 12];

function getPath(obj, path) {
	return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function normalizeFormula(formula) {
	return String(formula ?? "")
		.replace(/[−–—]/g, "-")
		.replace(/\s+/g, "");
}

/**
 * @returns {{ok: boolean, terms: Array<{sign: number, kind: string, n?: number, d?: number, value?: number, text?: string}>}}
 */
export function parseFormula(formula) {
	const src = normalizeFormula(formula);
	if (!src) return { ok: true, terms: [] };
	if (/[()*/{}\[\]]/.test(src)) return { ok: false, terms: [] };
	const terms = [];
	const re = /([+-]?)([^+-]+)/g;
	let m;
	let consumed = 0;
	while ((m = re.exec(src))) {
		consumed += m[0].length;
		const sign = m[1] === "-" ? -1 : 1;
		const body = m[2];
		let t;
		if ((t = body.match(/^(\d*)d(\d+)$/i))) {
			terms.push({ sign, kind: "dice", n: Number(t[1] || 1), d: Number(t[2]) });
		} else if (/^\d+(\.\d+)?$/.test(body)) {
			terms.push({ sign, kind: "num", value: Number(body) });
		} else if (/^@[\w.]+$/.test(body)) {
			terms.push({ sign, kind: "ref", text: body });
		} else if (body.toLowerCase() === "padrao") {
			terms.push({ sign, kind: "ref", text: "padrao" });
		} else {
			return { ok: false, terms: [] };
		}
	}
	if (consumed !== src.length) return { ok: false, terms: [] };
	return { ok: true, terms };
}

function refValue(text, rollData) {
	if (text === "padrao") return Number(getPath(rollData, "for")) || 0;
	return Number(getPath(rollData, text.slice(1))) || 0;
}

export function minMax(terms, rollData = {}) {
	let min = 0;
	let max = 0;
	for (const t of terms) {
		if (t.kind === "dice") {
			if (t.sign > 0) {
				min += t.n;
				max += t.n * t.d;
			} else {
				min -= t.n * t.d;
				max -= t.n;
			}
		} else {
			const v = t.sign * (t.kind === "num" ? t.value : refValue(t.text, rollData));
			min += v;
			max += v;
		}
	}
	return { min, max };
}

/** Dano médio pela regra do livro: (mínimo + máximo) / 2, arredondado para baixo. */
export function averageOf(terms, rollData = {}) {
	const { min, max } = minMax(terms, rollData);
	return Math.floor((min + max) / 2);
}

export function averageFormula(formula, rollData = {}) {
	const p = parseFormula(formula);
	return p.ok ? averageOf(p.terms, rollData) : null;
}

export function formatTerms(terms) {
	const dice = terms.filter((t) => t.kind === "dice");
	const refs = terms.filter((t) => t.kind === "ref");
	const constant = terms.filter((t) => t.kind === "num").reduce((s, t) => s + t.sign * t.value, 0);
	const out = [];
	for (const t of [...dice, ...refs]) {
		const body = t.kind === "dice" ? `${t.n}d${t.d}` : t.text;
		out.push({ sign: t.sign, body });
	}
	if (constant !== 0 || out.length === 0) out.push({ sign: constant < 0 ? -1 : 1, body: String(Math.abs(constant)) });
	return out.map((o, i) => (i === 0 ? (o.sign < 0 ? "-" : "") : o.sign < 0 ? "-" : "+") + o.body).join("");
}

const NON_DAMAGE_TYPES = new Set(["curapv", "curapm", "curatpv", "curatpm"]);

export function isDamagePart(part) {
	const [formula, type] = Array.isArray(part) ? part : [part, ""];
	return !!String(formula ?? "").trim() && !NON_DAMAGE_TYPES.has(type);
}

/** Média total de uma rolagem de dano (todas as partes de dano somadas). */
export function averageParts(parts, rollData = {}) {
	const terms = [];
	for (const part of parts ?? []) {
		if (!isDamagePart(part)) continue;
		const p = parseFormula(part[0]);
		if (!p.ok) return null;
		terms.push(...p.terms);
	}
	return averageOf(terms, rollData);
}

function stepDown(d) {
	const i = DIE_STEPS.indexOf(d);
	if (i > 0) return DIE_STEPS[i - 1];
	if (i === -1) {
		const lower = DIE_STEPS.filter((s) => s < d);
		return lower.length ? lower[lower.length - 1] : d;
	}
	return d;
}

/**
 * Reescala as partes de uma rolagem de dano para atingir um dano médio alvo.
 * A quantidade de dados é multiplicada pela proporção (alvo / média atual) e o
 * bônus fixo da primeira parte é recalculado para atingir a média exata.
 *
 * @param {Array<[string,string,string]>} parts
 * @param {number} target
 * @param {object} rollData
 * @returns {{ok: boolean, parts: Array, oldAvg: number|null, newAvg: number|null}}
 */
export function rescaleParts(parts, target, rollData = {}) {
	const oldAvg = averageParts(parts, rollData);
	if (oldAvg === null) return { ok: false, parts, oldAvg: null, newAvg: null };
	target = Math.max(1, Math.round(target));
	const dmgIdx = parts.map((p, i) => (isDamagePart(p) ? i : -1)).filter((i) => i >= 0);
	if (!dmgIdx.length) return { ok: false, parts, oldAvg, newAvg: oldAvg };

	const k = oldAvg > 0 ? target / oldAvg : 1;
	const parsed = dmgIdx.map((i) => parseFormula(parts[i][0]).terms.map((t) => ({ ...t })));
	// Dano só de dados (ex.: sopro 6d12) continua só de dados. Com bônus fixo, os
	// dados crescem pela raiz da proporção e o bônus absorve o resto, como nas
	// fichas publicadas (ex.: 1d10+12 no ND 6, 4d10+25 no ND 12).
	const pureDice = !parsed[0].some((t) => t.kind === "num" && t.value !== 0);
	const diceFactor = pureDice ? k : Math.sqrt(k);

	parsed.forEach((terms, j) => {
		for (const t of terms) {
			if (t.kind === "dice") t.n = Math.max(1, Math.round(t.n * (j === 0 ? diceFactor : k)));
			// Constantes das partes extras (ex.: "+2 de fogo") acompanham a proporção.
			else if (t.kind === "num" && j > 0) t.value = Math.round(t.value * k);
		}
	});

	const main = parsed[0];
	const solveConstant = () => {
		const rest = [...main.filter((t) => t.kind !== "num"), ...parsed.slice(1).flat()];
		return target - averageOf(rest, rollData);
	};

	let c = solveConstant();
	// Se o bônus ficar negativo, reduz dados até caber.
	let guard = 100;
	while (c < 0 && guard-- > 0) {
		const allDice = parsed.flat().filter((t) => t.kind === "dice" && t.sign > 0);
		const reducible = allDice.filter((t) => t.n > 1).sort((a, b) => b.n * b.d - a.n * a.d)[0];
		if (reducible) reducible.n -= 1;
		else {
			const biggest = allDice.filter((t) => stepDown(t.d) !== t.d).sort((a, b) => b.d - a.d)[0];
			if (!biggest) break;
			biggest.d = stepDown(biggest.d);
		}
		c = solveConstant();
	}

	const newMain = main.filter((t) => t.kind !== "num");
	if (c !== 0) newMain.push({ sign: c < 0 ? -1 : 1, kind: "num", value: Math.abs(c) });
	parsed[0] = newMain;

	const newParts = parts.map((p) => [...p]);
	dmgIdx.forEach((i, j) => {
		newParts[i][0] = formatTerms(parsed[j]);
	});
	return { ok: true, parts: newParts, oldAvg, newAvg: averageParts(newParts, rollData) };
}

/** Reescala uma única fórmula de texto (usada em descrições). */
export function rescaleFormula(formula, target, rollData = {}) {
	const r = rescaleParts([[formula, "", ""]], target, rollData);
	return r.ok ? r.parts[0][0] : null;
}

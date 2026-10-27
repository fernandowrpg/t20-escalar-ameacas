/**
 * Parâmetros de criaturas por papel e ND (Ameaças de Arton, Tabela 2-3 A/B/C).
 * Cada linha: [ataque, dano médio, defesa, res. forte, res. média, res. fraca, PV, CD].
 */

export const ND_LIST = Object.freeze([
	"1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
	"11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "S", "S+"
]);

const ROWS = {
	solo: [
		[6, 8, 11, 3, 0, -2, 7, 12],
		[7, 10, 14, 6, 3, -1, 15, 13],
		[9, 15, 16, 11, 5, 0, 35, 14],
		[12, 18, 19, 13, 7, 2, 70, 16],
		[14, 21, 21, 15, 9, 3, 105, 17],
		[16, 24, 23, 16, 10, 4, 140, 18],
		[17, 40, 24, 17, 11, 5, 200, 20],
		[20, 56, 27, 18, 12, 6, 240, 22],
		[24, 62, 31, 20, 14, 7, 280, 24],
		[26, 68, 33, 21, 15, 8, 320, 26],
		[27, 74, 34, 21, 15, 9, 360, 28],
		[29, 80, 36, 22, 16, 10, 400, 30],
		[34, 130, 41, 24, 18, 11, 550, 31],
		[36, 144, 43, 26, 20, 12, 600, 33],
		[37, 158, 44, 26, 20, 13, 650, 35],
		[39, 172, 46, 28, 22, 14, 700, 38],
		[43, 186, 50, 28, 22, 15, 750, 40],
		[46, 200, 53, 30, 24, 16, 800, 42],
		[47, 270, 54, 30, 24, 17, 1020, 44],
		[49, 288, 56, 32, 26, 18, 1080, 47],
		[52, 306, 59, 32, 26, 19, 1140, 47],
		[54, 324, 61, 34, 28, 20, 1200, 49],
		[58, 360, 65, 36, 30, 22, 2500, 51],
		[65, 500, 70, 38, 33, 25, 4000, 55]
	],
	lackey: [
		[7, 9, 10, 2, 0, -1, 4, 12],
		[9, 11, 13, 5, 3, 0, 6, 13],
		[11, 17, 15, 10, 5, 1, 9, 14],
		[14, 21, 18, 12, 7, 3, 14, 16],
		[16, 24, 20, 14, 9, 4, 21, 17],
		[17, 32, 22, 15, 10, 5, 28, 18],
		[20, 56, 23, 16, 11, 6, 40, 20],
		[24, 62, 26, 17, 12, 7, 48, 22],
		[26, 68, 30, 19, 14, 8, 56, 24],
		[27, 74, 32, 20, 15, 9, 64, 26],
		[29, 80, 33, 20, 15, 10, 72, 28],
		[34, 105, 35, 21, 16, 11, 80, 30],
		[36, 144, 40, 23, 18, 12, 110, 31],
		[37, 158, 42, 25, 20, 13, 120, 33],
		[39, 172, 43, 25, 20, 14, 130, 35],
		[43, 186, 45, 27, 22, 15, 140, 38],
		[46, 200, 49, 27, 22, 16, 150, 40],
		[47, 235, 52, 29, 24, 17, 160, 42],
		[49, 288, 53, 29, 24, 18, 204, 44],
		[52, 306, 55, 31, 26, 19, 216, 47],
		[54, 324, 58, 31, 26, 20, 228, 47],
		[56, 344, 60, 33, 28, 21, 240, 49],
		[60, 385, 64, 35, 30, 23, 500, 51],
		[67, 540, 69, 37, 33, 26, 800, 55]
	],
	special: [
		[4, 8, 11, 3, 0, -2, 5, 14],
		[5, 10, 12, 6, 3, -1, 11, 15],
		[7, 15, 14, 11, 5, 0, 25, 16],
		[10, 18, 17, 13, 7, 2, 49, 18],
		[12, 21, 19, 15, 9, 3, 74, 19],
		[14, 24, 21, 16, 10, 4, 98, 20],
		[15, 40, 22, 17, 11, 5, 140, 22],
		[18, 56, 25, 18, 12, 6, 168, 24],
		[22, 62, 29, 20, 14, 7, 196, 26],
		[24, 68, 31, 21, 15, 8, 224, 28],
		[25, 74, 32, 21, 15, 9, 252, 30],
		[27, 80, 34, 22, 16, 10, 280, 32],
		[32, 130, 39, 24, 18, 11, 385, 33],
		[34, 144, 41, 26, 20, 12, 420, 35],
		[35, 158, 42, 26, 20, 13, 455, 37],
		[37, 172, 44, 28, 22, 14, 490, 40],
		[41, 186, 48, 28, 22, 15, 525, 42],
		[44, 200, 51, 30, 24, 16, 560, 44],
		[45, 270, 52, 30, 24, 17, 714, 46],
		[47, 288, 54, 32, 26, 18, 756, 49],
		[50, 306, 57, 32, 26, 19, 798, 49],
		[52, 324, 59, 34, 28, 20, 840, 51],
		[55, 360, 63, 36, 30, 22, 1750, 55],
		[60, 500, 67, 38, 33, 25, 2800, 60]
	]
};

/** Valores usados pelo sistema T20 em system.detalhes.role. */
export const ROLES = Object.freeze(["solo", "lackey", "special"]);

const ROLE_ALIASES = { lacaio: "lackey", minion: "lackey", especial: "special" };

export function normalizeRole(role) {
	const r = String(role ?? "").trim().toLowerCase();
	if (ROLES.includes(r)) return r;
	return ROLE_ALIASES[r] ?? null;
}

export function ndIndex(nd) {
	const idx = ND_LIST.indexOf(String(nd ?? "").trim());
	return idx;
}

/** Linha de parâmetros para um papel e índice de ND (com limite nas bordas). */
export function rowAt(role, idx) {
	const rows = ROWS[role] ?? ROWS.solo;
	const i = Math.max(0, Math.min(rows.length - 1, idx));
	const [ataque, dano, defesa, forte, media, fraca, pv, cd] = rows[i];
	return { ataque, dano, defesa, forte, media, fraca, pv, cd };
}

/** Nível efetivo usado pelo sistema T20 (S e S+ contam como 20, frações como 1). */
export function ndLevel(nd) {
	if (["S", "S+"].includes(nd)) return 20;
	return Number(nd) || 1;
}

/** ND numérico para regras baseadas em "15 + ND" (frações contam pelo valor real). */
export function ndNumber(nd) {
	if (["S", "S+"].includes(nd)) return 20;
	if (nd === "1/4") return 0.25;
	if (nd === "1/2") return 0.5;
	return Number(nd) || 0;
}

export function patamar(nd) {
	const idx = ndIndex(nd);
	if (idx < 0) return "iniciante";
	if (idx <= 5) return "iniciante";
	if (idx <= 11) return "veterano";
	if (idx <= 17) return "campeao";
	if (idx <= 21) return "lenda";
	return "lmais";
}

export const PATAMAR_ORDER = ["iniciante", "veterano", "campeao", "lenda", "lmais"];

/** Mesmas fórmulas do sistema T20 para NPCs (meionivel e bônus de treinamento). */
export function halfLevel(nd) {
	return Math.floor(ndLevel(nd) / 2);
}

export function trainingBonus(nd) {
	const n = ndLevel(nd);
	return n > 14 ? 6 : n > 6 ? 4 : 2;
}

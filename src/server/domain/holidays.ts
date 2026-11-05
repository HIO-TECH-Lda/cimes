/**
 * Feriados (RF-ADM-07, F.7): regra moçambicana de observância — um feriado
 * que calha ao domingo observa-se na segunda-feira seguinte (Anexo F). Datas
 * sempre em UTC (meio-dia nunca muda de dia).
 */

export function observedDate(date: Date): Date {
  const observed = new Date(date);
  if (observed.getUTCDay() === 0) {
    observed.setUTCDate(observed.getUTCDate() + 1);
  }
  return observed;
}
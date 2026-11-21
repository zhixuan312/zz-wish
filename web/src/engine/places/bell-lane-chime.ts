// One local morning or evening call. This survives an audio graph restart so
// leaving and returning in the same slot cannot schedule the same call again.
export function bellLaneChimes() {
  const handled = new Set<string>();
  return (date: Date, inCourt: boolean, audible: boolean) => {
    const hour = date.getHours();
    if (!inCourt || (hour !== 6 && hour !== 18)) return false;
    const slot = [date.getFullYear(), date.getMonth(), date.getDate(), hour].join('/');
    if (handled.has(slot)) return false;
    handled.add(slot);
    return audible;
  };
}

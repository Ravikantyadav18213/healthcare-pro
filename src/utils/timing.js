/* ==================================================================
   MINIMUM VISIBLE REFRESH DURATION

   On localhost (and often in production too, once cached) a refresh
   round-trip can finish in a few milliseconds — far too fast for the
   spinning refresh icon to actually be seen rotating. That reads as
   "the button doesn't do anything" even though it worked. Padding a
   manual refresh out to a minimum duration makes the spin genuinely
   visible without slowing down anything the user isn't watching.
================================================================== */

export async function padRefresh(isRefresh, startedAt, minMs = 500) {
  if (!isRefresh) return;
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

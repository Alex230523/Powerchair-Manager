/** Temporary operator policy. It changes MFA enforcement, never role or resource authorization. */
export function mfaRequired() {
  return process.env.PFM_MFA_SUSPENDED !== "true";
}
export function mfaSatisfied(enabled: boolean) {
  return !mfaRequired() || enabled;
}

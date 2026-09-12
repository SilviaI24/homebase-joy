export type PasswordValidation = { ok: true } | { ok: false; reason: string };

export function validatePasswordReset(newPass: string, confirm: string): PasswordValidation {
  if (newPass.length < 8) {
    return { ok: false, reason: "La contraseña debe tener al menos 8 caracteres" };
  }
  if (newPass !== confirm) {
    return { ok: false, reason: "Las contraseñas no coinciden" };
  }
  return { ok: true };
}

export type UpdateResult = { ok: true } | { ok: false; reason: string };

export async function executePasswordUpdate(
  newPass: string,
  auth: {
    updateUser: (params: { password: string }) => Promise<{ error: Error | null }>;
    signOut: () => Promise<unknown>;
  },
): Promise<UpdateResult> {
  const { error } = await auth.updateUser({ password: newPass });
  if (error) {
    // 12 sep 2026: el mensaje genérico de abajo (deliberadamente sin detalle
    // interno del error real, ver tests T05) hizo perder tiempo real a
    // David — Supabase rechazó su contraseña por estar en una lista de
    // filtraciones conocidas (protección "leaked password" del proyecto) y
    // la pantalla le dijo "el enlace puede haber expirado", que no era la
    // causa. Este caso concreto no revela nada de la sesión/cuenta — es
    // sobre la contraseña nueva que el propio usuario acaba de escribir —
    // así que se distingue y se traduce, sin tocar el resto (JWT/sesión
    // siguen devolviendo el mensaje genérico de siempre).
    if (/weak|easy to guess|pwned/i.test(error.message)) {
      return {
        ok: false,
        reason:
          "Esa contraseña es demasiado fácil de adivinar o ha aparecido en alguna filtración conocida. Prueba con otra distinta (evita una que ya uses en otro sitio).",
      };
    }
    return {
      ok: false,
      reason: "No se pudo actualizar la contraseña. El enlace puede haber expirado.",
    };
  }
  await auth.signOut();
  return { ok: true };
}

export function detectRecoverySession(
  auth: {
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  },
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    // Declared with let so settle() can reference it before assignment completes
    // (guards against synchronous callback invocation in tests via optional chaining)
    // eslint-disable-next-line prefer-const -- ver comentario de arriba
    let sub: ReturnType<typeof auth.onAuthStateChange> | undefined;

    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      sub?.data.subscription.unsubscribe();
      resolve(value);
    };

    sub = auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") settle(true);
    });

    setTimeout(() => settle(false), timeoutMs);
  });
}

import { NextResponse } from "next/server";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

function validatePasswordComplexity(password: string) {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must include at least 1 lowercase letter.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include at least 1 uppercase letter.";
  }

  if (!/\d/.test(password)) {
    return "Password must include at least 1 number.";
  }

  return "";
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const form = await req.formData();
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "All password fields are required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "New password confirmation does not match." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        {
          ok: false,
          error: "New password must be different from your current password.",
        },
        { status: 400 }
      );
    }

    const passwordError = validatePasswordComplexity(newPassword);
    if (passwordError) {
      return NextResponse.json(
        { ok: false, error: passwordError },
        { status: 400 }
      );
    }

    const passwordOk = await verifyPassword(currentPassword, user.passwordHash);

    if (!passwordOk) {
      return NextResponse.json(
        { ok: false, error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Your password has been updated successfully.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "Please login to continue." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to update password right now. Please try again.",
      },
      { status: 500 }
    );
  }
}

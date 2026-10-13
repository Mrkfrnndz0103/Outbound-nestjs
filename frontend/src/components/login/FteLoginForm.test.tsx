import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FteLoginForm } from "./FteLoginForm";

const props = {
  email: "operator@spxexpress.com",
  code: "",
  codeSent: true,
  resendAfter: 60,
  busy: false,
  error: "",
  onEmailChange: vi.fn(),
  onCodeChange: vi.fn(),
  onSubmit: vi.fn(),
  onResendCode: vi.fn(),
  onGoogleSignIn: vi.fn(),
  onBackToEmail: vi.fn(),
};

describe("FTE verification feedback", () => {
  it("announces verification failures and associates them with the code inputs", () => {
    const markup = renderToStaticMarkup(
      <FteLoginForm
        {...props}
        error="This verification code is invalid or expired."
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("This verification code is invalid or expired.");
    expect(markup.match(/aria-invalid="true"/g)).toHaveLength(6);
    expect(markup.match(/aria-describedby=/g)).toHaveLength(6);
  });

  it("keeps changing email available during the resend cooldown", () => {
    const markup = renderToStaticMarkup(<FteLoginForm {...props} />);

    expect(markup).toContain("Change email");
    expect(markup).toContain("Resend in");
  });

  it("shows pending feedback and disables code inputs during verification", () => {
    const markup = renderToStaticMarkup(<FteLoginForm {...props} busy />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Verifying");
    const inputs = markup.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(6);
    expect(inputs.every((input) => input.includes('disabled=""'))).toBe(true);
  });

  it("disables resend and changing email while a request is pending", () => {
    const markup = renderToStaticMarkup(
      <FteLoginForm {...props} busy resendAfter={0} />,
    );

    const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(
      true,
    );
  });
});

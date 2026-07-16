import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useI18n } from "../app/i18n.js";
import { Icon } from "./Icon.js";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  fieldClassName?: string;
};

export function PasswordInput({
  label,
  hint,
  fieldClassName = "",
  id,
  ...props
}: PasswordInputProps) {
  const { l } = useI18n();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const action = visible
    ? l("Sembunyikan password", "Hide password", "隐藏密码")
    : l("Tampilkan password", "Show password", "显示密码");

  return (
    <div className={`field ${fieldClassName}`.trim()}>
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input">
        <input {...props} id={inputId} type={visible ? "text" : "password"} />
        <button
          className="password-toggle"
          type="button"
          aria-label={action}
          aria-pressed={visible}
          title={action}
          onClick={() => setVisible((current) => !current)}
        >
          <Icon name={visible ? "eyeOff" : "eye"} />
        </button>
      </div>
      {hint}
    </div>
  );
}

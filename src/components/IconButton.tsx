import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export default function IconButton({
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button className="icon-button" type="button" {...props}>
      {children}
    </button>
  );
}

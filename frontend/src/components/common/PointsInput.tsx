import { InputHTMLAttributes } from 'react';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: string;
  onChange: (value: string) => void;
};

/** A plain decimal field, without steppers or scroll-wheel changes. */
export function PointsInput({ value, onChange, ...props }: Props) {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      maxLength={12}
      value={value}
      placeholder={props.placeholder ?? 'Enter points'}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

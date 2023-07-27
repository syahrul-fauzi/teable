import type { Colors } from '@teable-group/core';

interface IOption {
  label: string;
  value: string;
}

interface IColorOption extends IOption {
  color: Colors;
}

interface IBaseSelect<T = IOption> {
  options: T[];
  value: string | null;
  className?: string;
  popoverClassName?: string;
  disabled?: boolean;
  notFoundText?: string;
  onSelect: (value: string | null) => void;
  optionRender?: (option: T) => React.ReactElement;
  displayRender?: (option: T) => React.ReactElement;
}

export type { IOption, IColorOption, IBaseSelect };
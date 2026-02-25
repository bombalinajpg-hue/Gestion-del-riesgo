declare module '@react-native-picker/picker' {
  import * as React from 'react';
    import { ViewProps } from 'react-native';

  export interface PickerProps<T> extends ViewProps {
    selectedValue?: T;
    onValueChange?: (itemValue: T, itemIndex: number) => void;
    enabled?: boolean;
    mode?: 'dialog' | 'dropdown';
  }

  export class Picker<T> extends React.Component<PickerProps<T>> {
    static Item: React.ComponentType<{
      label: string;
      value: T;
      color?: string;
    }>;
  }
}

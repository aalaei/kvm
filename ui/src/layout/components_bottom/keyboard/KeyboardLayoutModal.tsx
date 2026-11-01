import { Modal, Select, Typography } from 'antd';

import { dark_bg_style_fun } from "@/layout/theme_color";
import { useTheme } from "@/layout/contexts/ThemeContext";

const { Option } = Select;
const { Text, Paragraph } = Typography;

interface KeyboardLayoutOption {
  value: string;
  label: string;
}

interface KeyboardLayoutContentProps {
  value?: string;
  onChange?: (value: string) => void;
  layoutOptions?: KeyboardLayoutOption[];
}

interface KeyboardLayoutModalProps extends KeyboardLayoutContentProps {
  visible: boolean;
  onCancel: () => void;
}


const KeyboardLayoutContent: React.FC<KeyboardLayoutContentProps> = ({
                                                                       value = 'Français',
                                                                       onChange,
                                                                       layoutOptions = [
                                                                         { value: 'Français', label: 'Français' },
                                                                         { value: 'English-US', label: 'English (US)' },
                                                                         { value: 'English-UK', label: 'English (UK)' },
                                                                         { value: 'Deutsch', label: 'Deutsch' },
                                                                         { value: 'Español', label: 'Español' },
                                                                       ],
                                                                     }) => {
  const descriptionText = `Pasting text sends individual key strokes to the target device. The keyboard layout determines which key codes are being sent. Ensure that the keyboard layout in KVM matches the settings in the operating system.`;

  const handleChange = (newValue: string) => {
    if (onChange) {
      onChange(newValue);
    }
  };
const {isDark} = useTheme();
  return (
    <>
      <div style={{ marginBottom: 16 }} className={dark_bg_style_fun(isDark)}>
        <Text style={{ display: 'block', marginBottom: 8 }}>
          Keyboard layout of target operating system:
        </Text>
        <Select
          value={value}
          onChange={handleChange}
          style={{ width: '100%' }}
          size="middle"
        >
          {layoutOptions.map((option) => (
            <Option key={option.value} value={option.value}>
              {option.label}
            </Option>
          ))}
        </Select>
      </div>

      <Paragraph
        style={{
          color: 'rgba(102, 102, 102, 1)',
          fontSize: '12px',
          fontWeight: 400,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {descriptionText}
      </Paragraph>
    </>
  );
};

const KeyboardLayoutModal: React.FC<KeyboardLayoutModalProps> = ({
                                                                   visible,
                                                                   onCancel,
                                                                   value,
                                                                   onChange,
                                                                   layoutOptions,
                                                                 }) => {
  return (
    <Modal
      title={
        <Text strong style={{ fontSize: '16px' }}>
          Keyboard layout
        </Text>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      maskClosable={true}
      keyboard={true}
      width={480}
      styles={{
        body: {
          padding: '20px 24px',
        },
        header: {
          borderBottom: '1px solid #f0f0f0',
          padding: '16px 24px',
          marginBottom: 0,
        }
      }}
    >
      <KeyboardLayoutContent
        value={value}
        onChange={onChange}
        layoutOptions={layoutOptions}
      />
    </Modal>
  );
};

export default KeyboardLayoutModal;
export { KeyboardLayoutContent };
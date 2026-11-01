import React from 'react';
import { isMobile } from 'react-device-detect';

interface DeviceAwareComponentProps {
  pcComponent: React.ReactNode;
  mobileComponent: React.ReactNode;
}

const DeviceAwareComponent: React.FC<DeviceAwareComponentProps> = ({
                                                                     pcComponent,
                                                                     mobileComponent
                                                                   }) => {
  return (
    <>
      {isMobile ? mobileComponent : pcComponent}
    </>
  );
};

export default DeviceAwareComponent;
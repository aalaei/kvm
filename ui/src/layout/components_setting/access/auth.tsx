import { useState } from "react";
import { useRevalidator } from "react-router-dom";
import { useReactAt } from "i18n-auto-extractor/react";

import { Button } from "@components/Button";
import { InputFieldWithLabel } from "@components/InputField";
import api from "@/api";
import { useLocalAuthModalStore } from "@/hooks/stores";

export function Dialog({ onClose }: { onClose: () => void }) {
  const { $at } = useReactAt();
  const { modalView, setModalView } = useLocalAuthModalStore();
  const [error, setError] = useState<string | null>(null);
  const revalidator = useRevalidator();

  const handleCreatePassword = async (password: string, confirmPassword: string) => {
    if (password === "") {
      setError("Please enter a password");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      const res = await api.POST("/auth/password-local", { password });
      if (res.ok) {
        setModalView("creationSuccess");
        // The rest of the app needs to revalidate the device authMode
        revalidator.revalidate();
      } else {
        const data = await res.json();
        setError(data.error || "An error occurred while SettingsModal the password");
      }
    } catch (error) {
      console.error(error);
      setError("An error occurred while SettingsModal the password");
    }
  };

  const handleUpdatePassword = async (
    oldPassword: string,
    newPassword: string,
    confirmNewPassword: string,
  ) => {
    if (newPassword !== confirmNewPassword) {
      setError($at("Passwords do not match"));
      return;
    }

    if (oldPassword === "") {
      setError($at("Please enter your old password"));
      return;
    }

    if (newPassword === "") {
      setError($at("Please enter a new password"));
      return;
    }

    try {
      const res = await api.PUT("/auth/password-local", {
        oldPassword,
        newPassword,
      });

      if (res.ok) {
        setModalView("updateSuccess");
        // The rest of the app needs to revalidate the device authMode
        revalidator.revalidate();
      } else {
        const data = await res.json();
        setError(data.error || $at("An error occurred while changing the password"));
      }
    } catch (error) {
      console.error(error);
      setError($at("An error occurred while changing the password"));
    }
  };

  const handleDeletePassword = async (password: string) => {
    if (password === "") {
      setError($at("Please enter your current password"));
      return;
    }

    try {
      const res = await api.DELETE("/auth/local-password", { password });
      if (res.ok) {
        setModalView("deleteSuccess");
        // The rest of the app needs to revalidate the device authMode
        revalidator.revalidate();
      } else {
        const data = await res.json();
        setError(data.error || $at("An error occurred while disabling the password"));
      }
    } catch (error) {
      console.error(error);
      setError($at("An error occurred while disabling the password"));
    }
  };

  return (
    <div
      onKeyUp={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();}}
    >
      {modalView === "createPassword" && (
        <CreatePasswordModal
          onSetPassword={handleCreatePassword}
          onCancel={onClose}
          error={error}
        />
      )}

      {modalView === "deletePassword" && (
        <DeletePasswordModal
          onDeletePassword={handleDeletePassword}
          onCancel={onClose}
          error={error}
        />
      )}

      {modalView === "updatePassword" && (
        <UpdatePasswordModal
          onUpdatePassword={handleUpdatePassword}
          onCancel={onClose}
          error={error}
        />
      )}

      {modalView === "creationSuccess" && (
        <SuccessModal
          headline={$at("Password Set Successfully")}
          description={$at("You've successfully set up local device protection. Your device is now secure against unauthorized local access.")}
          onClose={onClose}
        />
      )}

      {modalView === "deleteSuccess" && (
        <SuccessModal
          headline={$at("Password Protection Disabled")}
          description={$at("You've successfully disabled the password protection for local access. Remember, your device is now less secure.")}
          onClose={onClose}
        />
      )}

      {modalView === "updateSuccess" && (
        <SuccessModal
          headline={$at("Password Updated Successfully")}
          description={$at("You've successfully changed your local device protection password. Make sure to remember your new password for future access.")}
          onClose={onClose}
        />
      )}

    </div>
  );
}

function CreatePasswordModal({
                               onSetPassword,
                               onCancel,
                               error,
                             }: {
  onSetPassword: (password: string, confirmPassword: string) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { $at } = useReactAt();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <div className="flex w-full max-w-lg flex-col items-start justify-start space-y-4 text-left">
      <div>
        <h2 className="text-lg font-semibold dark:text-white">
          {$at("Local Device Protection")}
        </h2>
        <p className="text-sm text-slate-600 dark:text-[#ffffff]">
          {$at("Create a password to protect your device from unauthorized local access.")}
        </p>
      </div>
      <form
        className="w-full space-y-4"
        onSubmit={e => {
          e.preventDefault();
        }}
      >
        <InputFieldWithLabel
          label={$at("New Password")}
          type="password"
          placeholder={$at("Enter a strong password")}
          value={password}
          autoFocus
          onChange={e => setPassword(e.target.value)}
        />
        <InputFieldWithLabel
          label={$at("Confirm New Password")}
          type="password"
          placeholder={$at("Re-enter your password")}
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />

        <div className="flex gap-x-2">
          <Button
            size="SM"
            theme="primary"
            text={$at("Secure Device")}
            onClick={() => onSetPassword(password, confirmPassword)}
          />
          <Button size="SM" theme="light" text={$at("Not Now")} onClick={onCancel} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </div>
  );
}

function DeletePasswordModal({
                               onDeletePassword,
                               onCancel,
                               error,
                             }: {
  onDeletePassword: (password: string) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { $at } = useReactAt();
  const [password, setPassword] = useState("");

  return (
    <div className="flex w-full max-w-lg flex-col items-start justify-start space-y-4 text-left">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">
            {$at("Disable Local Device Protection")}
          </h2>
          <p className="text-sm text-slate-600 dark:text-[#ffffff]">
            {$at("Enter your current password to disable local device protection")}
          </p>
        </div>
        <InputFieldWithLabel
          label={$at("Current Password")}
          type="password"
          placeholder={$at("Enter your current password")}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <div className="flex gap-x-2">
          <Button
            size="SM"
            theme="danger"
            text={$at("Disable Protection")}
            onClick={() => onDeletePassword(password)}
          />
          <Button size="SM" theme="light" text={$at("Cancel")} onClick={onCancel} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function UpdatePasswordModal({
                               onUpdatePassword,
                               onCancel,
                               error,
                             }: {
  onUpdatePassword: (
    oldPassword: string,
    newPassword: string,
    confirmNewPassword: string,
  ) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { $at } = useReactAt();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  return (
    <div className="flex w-full max-w-lg flex-col items-start justify-start space-y-4 text-left">
      <div>
        <h2 className="text-lg font-semibold dark:text-white">
          {$at("Change Local Device Password")}
        </h2>
        <p className="text-sm text-slate-600 dark:text-[#ffffff]">
          {$at("Enter your current password and a new password to update your local device protection")}
        </p>
      </div>
      <form
        className="w-full space-y-4"
        onSubmit={e => {
          e.preventDefault();
        }}
      >
        <InputFieldWithLabel
          label={$at("Current Password")}
          type="password"
          placeholder={$at("Enter your current password")}
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
        />
        <InputFieldWithLabel
          label={$at("New Password")}
          type="password"
          placeholder={$at("Enter a new strong password")}
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
        <InputFieldWithLabel
          label={$at("Confirm New Password")}
          type="password"
          placeholder={$at("Re-enter your new password")}
          value={confirmNewPassword}
          onChange={e => setConfirmNewPassword(e.target.value)}
        />
        <div className="flex gap-x-2">
          <Button
            size="SM"
            theme="primary"
            text={$at("Update Password")}
            onClick={() => onUpdatePassword(oldPassword, newPassword, confirmNewPassword)}
          />
          <Button size="SM" theme="light" text={$at("Cancel")} onClick={onCancel} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </div>
  );
}

function SuccessModal({
                        headline,
                        description,
                        onClose,
                      }: {
  headline: string;
  description: string;
  onClose: () => void;
}) {
  const { $at } = useReactAt();
  return (
    <div className="flex w-full max-w-lg flex-col items-start justify-start space-y-4 text-left">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">{headline}</h2>
          <p className="text-sm text-slate-600 dark:text-[#ffffff]">{description}</p>
        </div>
        <Button size="SM" theme="primary" text={$at("Close")} onClick={onClose} />
      </div>
    </div>
  );
}

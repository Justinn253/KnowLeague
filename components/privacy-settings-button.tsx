'use client';

type GoogleFundingChoices = {
  callbackQueue?: unknown[];
  showRevocationMessage?: () => void;
};

export function PrivacySettingsButton() {
  const openPrivacySettings = () => {
    const googlefc = (window as Window & { googlefc?: GoogleFundingChoices }).googlefc;
    const showRevocationMessage = googlefc?.showRevocationMessage;

    if (googlefc?.callbackQueue && showRevocationMessage) {
      googlefc.callbackQueue.push(showRevocationMessage);
    }
  };

  return (
    <button
      type="button"
      onClick={openPrivacySettings}
      className="transition hover:text-amber-200"
    >
      Privacy and cookie settings
    </button>
  );
}

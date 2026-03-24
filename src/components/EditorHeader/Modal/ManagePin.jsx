import { useContext, useState } from "react";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { IdContext } from "../../../context/IdContext";
import { updatePin } from "../../../api/gists";

/**
 * PIN management modal body — used inside the shared Modal wrapper.
 * Modes:
 *   "set"    — design has no PIN, user wants to add one
 *   "change" — design is PIN-protected, user wants to change PIN
 *   "remove" — design is PIN-protected, user wants to remove PIN
 */
export default function ManagePin({ setModal }) {
  const { t } = useTranslation();
  const { gistId, pinProtected, setPinProtected } = useContext(IdContext);

  const [mode, setMode] = useState(pinProtected ? "change" : "set");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setError("");
  };

  const switchMode = (m) => {
    setMode(m);
    resetFields();
  };

  const handleSubmit = async () => {
    setError("");

    if (mode !== "remove" && !newPin) {
      setError("New PIN is required.");
      return;
    }
    if (mode !== "remove" && newPin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }
    if (mode !== "set" && !currentPin) {
      setError("Current PIN is required.");
      return;
    }
    if (!gistId) {
      setError("Save the diagram first before managing the PIN.");
      return;
    }

    setLoading(true);
    try {
      await updatePin(
        gistId,
        mode !== "set" ? currentPin : null,
        mode !== "remove" ? newPin : null,
      );
      const nowProtected = mode !== "remove";
      setPinProtected(nowProtected);
      Toast.success(
        mode === "set"
          ? "PIN set successfully."
          : mode === "change"
          ? "PIN changed successfully."
          : "PIN removed.",
      );
      setModal(0); // MODAL.NONE
    } catch (err) {
      const msg =
        err.response?.data?.message || "Failed to update PIN. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode tabs — only show when design is already PIN-protected */}
      {pinProtected && (
        <div className="flex gap-2">
          <button
            onClick={() => switchMode("change")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              mode === "change"
                ? "bg-sky-600 text-white border-sky-600"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Change PIN
          </button>
          <button
            onClick={() => switchMode("remove")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              mode === "remove"
                ? "bg-red-600 text-white border-red-600"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Remove PIN
          </button>
        </div>
      )}

      {/* Current PIN field (change / remove) */}
      {mode !== "set" && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Current PIN
          </label>
          <input
            type="password"
            maxLength={20}
            autoFocus
            placeholder="Current PIN..."
            value={currentPin}
            onChange={(e) => {
              setCurrentPin(e.target.value);
              setError("");
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
      )}

      {/* New PIN fields (set / change) */}
      {mode !== "remove" && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              New PIN
            </label>
            <input
              type="password"
              maxLength={20}
              autoFocus={mode === "set"}
              placeholder="New PIN..."
              value={newPin}
              onChange={(e) => {
                setNewPin(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Confirm new PIN
            </label>
            <input
              type="password"
              maxLength={20}
              placeholder="Confirm PIN..."
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
        </>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {/* Action button — rendered inside modal footer via onOk, but we also expose inline */}
      <button
        disabled={loading}
        onClick={handleSubmit}
        className="w-full px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? "Saving..."
          : mode === "set"
          ? "Set PIN"
          : mode === "change"
          ? "Change PIN"
          : "Remove PIN"}
      </button>
    </div>
  );
}

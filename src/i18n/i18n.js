import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { en, english } from "./locales/en";
import { vi, vietnamese } from "./locales/vi";

export const languages = [english, vietnamese];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    // Anything else (a browser in French, a language picked before
    // others were removed) falls back to English; "vi-VN" counts as "vi"
    supportedLngs: ["en", "vi"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    resources: { en, vi },
  });

export default i18n;

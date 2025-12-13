import { useContext } from "react";
import { TransformContext } from "../context/TransformContext";

export default function useTransform() {
  const context = useContext(TransformContext);
  
  if (!context) {
    throw new Error("useTransform must be used within a TransformContextProvider");
  }
  
  return context;
}

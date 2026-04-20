import { useContext } from "react";
import { CollaborationContext } from "../context/CollaborationContext";

export default function useCollaboration() {
  return useContext(CollaborationContext);
}

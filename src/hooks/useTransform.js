import { useContext } from "react";
import {
  TransformActionsContext,
  TransformContext,
} from "../context/TransformContext";

export default function useTransform() {
  return useContext(TransformContext);
}

/** A stable function returning the current transform. */
export function useGetTransform() {
  return useContext(TransformActionsContext).getTransform;
}

/** setTransform, without re-rendering on every pan and zoom. */
export function useSetTransform() {
  return useContext(TransformActionsContext).setTransform;
}

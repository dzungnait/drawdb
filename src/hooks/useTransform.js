import { useContext } from "react";
import {
  GetTransformContext,
  TransformContext,
} from "../context/TransformContext";

export default function useTransform() {
  return useContext(TransformContext);
}

/** A stable function returning the current transform. */
export function useGetTransform() {
  return useContext(GetTransformContext);
}

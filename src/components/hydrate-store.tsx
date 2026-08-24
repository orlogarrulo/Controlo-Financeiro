import { useEffect } from "react";
import { useFinance } from "@/lib/store";

export function HydrateStore() {
  useEffect(() => {
    void useFinance.persist.rehydrate();
  }, []);
  return null;
}

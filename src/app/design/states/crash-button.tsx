"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CrashButton() {
  const [crash, setCrash] = useState(false);
  if (crash) throw new Error("Deliberate error from the states page");
  return (
    <Button variant="danger" className="justify-self-start" onClick={() => setCrash(true)}>
      Break this page
    </Button>
  );
}

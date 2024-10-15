// src/app/api-docs/page.tsx

"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function APIDocs() {
  return <SwaggerUI url="/api/openapi.json" />;
}

import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      // Este proyecto usa efectos de sincronización y refs como almacenamiento
      // de estado para polling/SSE; son patrones intencionales aquí.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off"
    }
  }
];

export default config;

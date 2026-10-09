import assert from "node:assert/strict";
import { patronLike } from "../src/lib/patron-like.ts";

// Lo que escribe la persona se busca literal: %, _ y \ no son comodines.
assert.equal(patronLike("Mónica"), "%Mónica%");
assert.equal(patronLike("0%"), "%0\\%%");
assert.equal(patronLike("a_b"), "%a\\_b%");
assert.equal(patronLike("c:\\x"), "%c:\\\\x%");

console.log("búsqueda: patrón LIKE escapado OK");

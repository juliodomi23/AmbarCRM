import assert from "node:assert/strict";
import { configIdLogin, PERMISOS_INSTAGRAM, PERMISOS_MESSENGER } from "../src/lib/meta/messenger-facebook";

delete process.env.META_MESSENGER_CONFIG_ID;
delete process.env.META_INSTAGRAM_CONFIG_ID;
assert.equal(configIdLogin("messenger"), undefined);
process.env.META_MESSENGER_CONFIG_ID = " 123456789 ";
process.env.META_INSTAGRAM_CONFIG_ID = "no-es-numero";
assert.equal(configIdLogin("messenger"), "123456789");
assert.equal(configIdLogin("instagram"), undefined, "un valor inválido se ignora y el diálogo usa scope");
for (const permiso of ["pages_show_list", "pages_messaging", "pages_manage_metadata", "business_management"]) assert.ok(PERMISOS_MESSENGER.split(",").includes(permiso), permiso);
for (const permiso of ["pages_show_list", "instagram_basic", "instagram_manage_messages", "pages_manage_metadata", "pages_read_engagement", "business_management"]) assert.ok(PERMISOS_INSTAGRAM.split(",").includes(permiso), permiso);
console.log("OK · login Meta: config_id opcional y permisos de Messenger e Instagram");

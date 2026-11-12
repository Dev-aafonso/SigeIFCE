import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULES, AUTH_COMPONENTS, normalizarModulo, normalizarComponenteAuth,
  interpretarRota, caminhoDaRota, chaveDaRota,
} from "../shared/core/router-routing.mjs";

test("somente os módulos da aplicação são aceitos", () => {
  assert.equal(MODULES.length, 9);
  assert.equal(normalizarModulo(" Dashboard "), "dashboard");
  assert.equal(normalizarModulo("../../admin"), null);
  assert.equal(normalizarModulo("desconhecido"), null);
});

test("a autenticação restringe os componentes a um conjunto conhecido", () => {
  assert.deepEqual(AUTH_COMPONENTS, ["login", "cadastro", "selecao-funcao"]);
  assert.equal(normalizarComponenteAuth("CADASTRO"), "cadastro");
  assert.equal(normalizarComponenteAuth("../../x"), "login");
});

test("interpreta hash, inicialização e caminhos legados", () => {
  assert.deepEqual(interpretarRota("#/auth/cadastro", "/"), { module: "auth", component: "cadastro" });
  assert.deepEqual(interpretarRota("#/dashboard", "/"), { module: "dashboard", component: null });
  assert.deepEqual(interpretarRota("", "/registrations"), { module: "registrations", component: null });
  assert.deepEqual(interpretarRota("", "/index.html"), { module: "auth", component: "login" });
  assert.deepEqual(interpretarRota("#/inexistente", "/"), { module: "auth", component: "login" });
});

test("os endereços canônicos são estáveis e seguros", () => {
  assert.equal(caminhoDaRota({ module: "events" }), "/#/events");
  assert.equal(caminhoDaRota({ module: "auth", component: "login" }), "/#/auth/login");
  assert.equal(caminhoDaRota({ module: "../../admin" }), "/#/auth/login");
  assert.equal(chaveDaRota({ module: "config" }), "/#/config");
});

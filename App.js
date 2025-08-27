// App.js — Expo Go (SEM Firebase)
// Fluxo: Menu (nome do arquivo) → App principal
// Recursos: cálculo (vertical/horizontal/retangular), perímetro→diâmetro,
// VEGA A/B, tabela com passo, salvar na sessão e visualização CSV/JSON.

import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";

// ---------- Utils ----------
function toNumber(s) {
  const v = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}
const nowIso = () => new Date().toISOString();
const sanitizeFileName = (name) =>
  String(name || "calibracao").replace(/[^\w\-]+/g, "_");

// ---------- Fórmulas de volume ----------
function volVerticalLitros({ diametroMm, alturaMm }) {
  const Dm = diametroMm / 1000.0;
  const hm = alturaMm / 1000.0;
  const areaBase = (Math.PI * (Dm * Dm)) / 4.0; // m²
  return areaBase * hm * 1000.0; // L
}
function volRetangularLitros({ comprimentoMm, larguraMm, alturaMm }) {
  const Lm = comprimentoMm / 1000.0;
  const Wm = larguraMm / 1000.0;
  const hm = alturaMm / 1000.0;
  return Lm * Wm * hm * 1000.0; // L
}
function volHorizontalLitros({ diametroMm, comprimentoMm, alturaMm }) {
  const R = diametroMm / 1000.0 / 2.0;
  const C = comprimentoMm / 1000.0;
  const h = Math.max(0, Math.min(alturaMm / 1000.0, 2 * R));
  if (h <= 0) return 0;
  if (Math.abs(h - 2 * R) < 1e-9) return Math.PI * R * R * C * 1000.0; // cheio
  const segment =
    R * R * Math.acos((R - h) / R) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h));
  return C * segment * 1000.0;
}

// ---------- Inversões (altura por volume) ----------
function alturaFromVolumeVerticalMm({ diametroMm, volumeL, alturaMaxMm }) {
  const areaBase = Math.PI * Math.pow(diametroMm / 1000.0, 2) / 4.0;
  const h = (volumeL / 1000.0) / areaBase; // m
  return Math.max(0, Math.min(h * 1000.0, alturaMaxMm));
}
function alturaFromVolumeRetangularMm({ comprimentoMm, larguraMm, volumeL, alturaMaxMm }) {
  const base = (comprimentoMm / 1000.0) * (larguraMm / 1000.0);
  const h = (volumeL / 1000.0) / base; // m
  return Math.max(0, Math.min(h * 1000.0, alturaMaxMm));
}
function alturaFromVolumeHorizontalMm({ diametroMm, comprimentoMm, volumeL, tolMm = 0.1 }) {
  const Hmax = diametroMm; // mm
  let lo = 0, hi = Hmax, mid = 0;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    const v = volHorizontalLitros({ diametroMm, comprimentoMm, alturaMm: mid });
    if (Math.abs(v - volumeL) <= 0.01) break;
    if (v < volumeL) lo = mid; else hi = mid;
    if (hi - lo < tolMm) break;
  }
  return Math.max(0, Math.min(mid, Hmax));
}
function alturaFromVolumePorTipo({ tipo, diametroMm, alturaTotalMm, comprimentoMm, larguraMm, volumeL }) {
  if (tipo === "vertical") return alturaFromVolumeVerticalMm({ diametroMm, volumeL, alturaMaxMm: alturaTotalMm });
  if (tipo === "horizontal") return alturaFromVolumeHorizontalMm({ diametroMm, comprimentoMm, volumeL });
  if (tipo === "retangular") return alturaFromVolumeRetangularMm({ comprimentoMm, larguraMm, volumeL, alturaMaxMm: alturaTotalMm });
  return 0;
}

export default function App() {
  // telas: 'menu' (nome do arquivo) → 'main'
  const [screen, setScreen] = useState("menu");

  // Configuração (nome do arquivo)
  const [fileNameBase, setFileNameBase] = useState("calibracao");

  // Dimensões/tipos
  const [tipo, setTipo] = useState("vertical");
  const [diametroMm, setDiametroMm] = useState("3000");
  const [alturaTotalMm, setAlturaTotalMm] = useState("6000");
  const [comprimentoMm, setComprimentoMm] = useState("8000");
  const [larguraMm, setLarguraMm] = useState("2500");

  // Perímetro → diâmetro
  const [perimetroMm, setPerimetroMm] = useState("");
  const diametroPorPerimetroMm = useMemo(() => {
    const p = toNumber(perimetroMm);
    return Number.isFinite(p) && p > 0 ? p / Math.PI : null; // D = P/π
  }, [perimetroMm]);

  // Consulta e tabela
  const [volumeConsultaL, setVolumeConsultaL] = useState("2500");
  const [alturaCalculadaMm, setAlturaCalculadaMm] = useState(null);
  const [tabela, setTabela] = useState([]);
  const [passoTabela, setPassoTabela] = useState("2500");

  // VEGA A/B
  const [alturaProdutoMm, setAlturaProdutoMm] = useState("");
  const [distMedidorProdutoMm, setDistMedidorProdutoMm] = useState("");
  const [nivelUtilMm, setNivelUtilMm] = useState("");
  const [nivelUtilVolumeL, setNivelUtilVolumeL] = useState("");
  const [codigoMedidor, setCodigoMedidor] = useState("");
  const [senhaMedidor, setSenhaMedidor] = useState("");

  // Capacidade total (estimativa)
  const capacidadeTotalL = useMemo(() => {
    const H = toNumber(alturaTotalMm), D = toNumber(diametroMm), C = toNumber(comprimentoMm), W = toNumber(larguraMm);
    if (tipo === "vertical") { if (!(D > 0 && H > 0)) return 0; return Math.round(volVerticalLitros({ diametroMm: D, alturaMm: H })); }
    if (tipo === "horizontal") { if (!(D > 0 && C > 0)) return 0; return Math.round(volHorizontalLitros({ diametroMm: D, comprimentoMm: C, alturaMm: D })); }
    if (tipo === "retangular") { if (!(C > 0 && W > 0 && H > 0)) return 0; return Math.round(volRetangularLitros({ comprimentoMm: C, larguraMm: W, alturaMm: H })); }
    return 0;
  }, [tipo, diametroMm, alturaTotalMm, comprimentoMm, larguraMm]);

  function calcularAltura() {
    const V = toNumber(volumeConsultaL);
    if (!(V >= 0)) { Alert.alert("Erro", "Volume inválido"); return; }
    const h = alturaFromVolumePorTipo({
      tipo,
      diametroMm: toNumber(diametroMm),
      alturaTotalMm: toNumber(alturaTotalMm),
      comprimentoMm: toNumber(comprimentoMm),
      larguraMm: toNumber(larguraMm),
      volumeL: V,
    });
    setAlturaCalculadaMm(h);
  }

  function gerarTabela() {
    const cap = capacidadeTotalL;
    const step = Math.max(1, Math.round(Number(String(passoTabela).replace(",", ".")) || 2500));
    const out = [];
    for (let v = 0; v <= cap; v += step) {
      const h = alturaFromVolumePorTipo({
        tipo,
        diametroMm: toNumber(diametroMm),
        alturaTotalMm: toNumber(alturaTotalMm),
        comprimentoMm: toNumber(comprimentoMm),
        larguraMm: toNumber(larguraMm),
        volumeL: v,
      });
      out.push({ v: Math.round(v), h: Math.round(h) });
    }
    setTabela(out);
  }

  // -------- VEGA --------
  const distanciaBmm = useMemo(() => {
    const h = toNumber(alturaProdutoMm); const d = toNumber(distMedidorProdutoMm);
    if (!(h >= 0) || !(d >= 0)) return null; return h + d;
  }, [alturaProdutoMm, distMedidorProdutoMm]);

  const hUtilMm = useMemo(() => {
    const h = toNumber(nivelUtilMm);
    if (Number.isFinite(h) && h >= 0) return h;
    const v = toNumber(nivelUtilVolumeL);
    if (Number.isFinite(v) && v >= 0)
      return alturaFromVolumePorTipo({
        tipo,
        diametroMm: toNumber(diametroMm),
        alturaTotalMm: toNumber(alturaTotalMm),
        comprimentoMm: toNumber(comprimentoMm),
        larguraMm: toNumber(larguraMm),
        volumeL: v,
      });
    return null;
  }, [nivelUtilMm, nivelUtilVolumeL, tipo, diametroMm, alturaTotalMm, comprimentoMm, larguraMm]);

  const distanciaAmm = useMemo(() => {
    if (distanciaBmm == null || hUtilMm == null) return null;
    const a = distanciaBmm - hUtilMm;
    return Number.isFinite(a) ? a : null;
  }, [distanciaBmm, hUtilMm]);

  // -------- Sessão (em memória) --------
  const [calibracoes, setCalibracoes] = useState([]);
  function montarRegistroAtual() {
    return {
      id: nowIso(),
      quando: nowIso(),
      arquivoBase: sanitizeFileName(fileNameBase),
      tipo,
      dimensoes: { diametroMm, alturaTotalMm, comprimentoMm, larguraMm },
      perimetroMm,
      calculos: {
        capacidadeTotalL,
        alturaProdutoMm, distMedidorProdutoMm,
        nivelUtilMm, nivelUtilVolumeL, hUtilMm,
        distanciaBmm, distanciaAmm,
      },
      medidor: { codigo: codigoMedidor, senha: senhaMedidor },
    };
  }
  function salvarCalibracaoSessao() {
    if (distanciaBmm == null) { Alert.alert("Preencha", "Informe altura do produto e distância medidor→produto (para B)."); return; }
    const reg = montarRegistroAtual();
    setCalibracoes(prev => [reg, ...prev]);
    Alert.alert("OK", "Calibração salva nesta sessão.");
  }

  // Visualização CSV/JSON (copiar manualmente)
  const [mostraJson, setMostraJson] = useState(false);
  const [mostraCsv, setMostraCsv] = useState(false);
  function gerarCSV() {
    if (!tabela || tabela.length === 0) return "Volume (L);Altura (mm)\n";
    let s = "Volume (L);Altura (mm)\n";
    tabela.forEach((it) => { s += `${it.v};${it.h}\n`; });
    return s;
  }

  // ---------- Telas ----------
  if (screen === "menu") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: 16 }}>
          <Text style={styles.title}>Configuração Inicial</Text>
          <Text style={styles.caption}>Defina o nome-base que aparecerá nos registros/tabelas.</Text>
          <Text style={{ marginTop: 8 }}>Nome do arquivo (sem extensão)</Text>
          <TextInput
            value={fileNameBase}
            onChangeText={setFileNameBase}
            style={styles.input}
            placeholder="Ex.: tanque_A_2025_08_26"
          />
          <View style={{ marginTop: 12 }}>
            <Button title="Avançar" onPress={() => setScreen("main")} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- App principal ----------
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.title}>Calibração de Tanques</Text>
        <Text style={styles.caption}>Arquivo base: {sanitizeFileName(fileNameBase)}</Text>

        <View style={{ marginTop: 8 }}>
          <Button title="Alterar nome do arquivo" onPress={() => setScreen("menu")} />
        </View>

        {/* Tipo */}
        <View style={[styles.row, { marginTop: 12 }]}>
          <Button title={tipo === "vertical" ? "• Vertical" : "Vertical"} onPress={() => setTipo("vertical")} />
          <Button title={tipo === "horizontal" ? "• Horizontal" : "Horizontal"} onPress={() => setTipo("horizontal")} />
          <Button title={tipo === "retangular" ? "• Retangular" : "Retangular"} onPress={() => setTipo("retangular")} />
        </View>

        <Text style={styles.caption}>Capacidade estimada: {capacidadeTotalL} L</Text>

        {/* Dimensões */}
        {tipo === "vertical" && (
          <View style={styles.card}>
            <Text style={styles.subtitle}>Dimensões — Vertical</Text>
            <View style={styles.row}>
              <View style={styles.col}><Text>Diâmetro (mm)</Text><TextInput value={diametroMm} onChangeText={setDiametroMm} keyboardType="numeric" style={styles.input} /></View>
              <View style={styles.col}><Text>Altura total (mm)</Text><TextInput value={alturaTotalMm} onChangeText={setAlturaTotalMm} keyboardType="numeric" style={styles.input} /></View>
            </View>
          </View>
        )}
        {tipo === "horizontal" && (
          <View style={styles.card}>
            <Text style={styles.subtitle}>Dimensões — Horizontal</Text>
            <View style={styles.row}>
              <View style={styles.col}><Text>Diâmetro (mm)</Text><TextInput value={diametroMm} onChangeText={setDiametroMm} keyboardType="numeric" style={styles.input} /></View>
              <View style={styles.col}><Text>Comprimento (mm)</Text><TextInput value={comprimentoMm} onChangeText={setComprimentoMm} keyboardType="numeric" style={styles.input} /></View>
            </View>
          </View>
        )}
        {tipo === "retangular" && (
          <View style={styles.card}>
            <Text style={styles.subtitle}>Dimensões — Retangular</Text>
            <View style={styles.row}>
              <View style={styles.col}><Text>Comprimento (mm)</Text><TextInput value={comprimentoMm} onChangeText={setComprimentoMm} keyboardType="numeric" style={styles.input} /></View>
              <View style={styles.col}><Text>Largura (mm)</Text><TextInput value={larguraMm} onChangeText={setLarguraMm} keyboardType="numeric" style={styles.input} /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.col}><Text>Altura total (mm)</Text><TextInput value={alturaTotalMm} onChangeText={setAlturaTotalMm} keyboardType="numeric" style={styles.input} /></View>
            </View>
          </View>
        )}

        {/* Perímetro → Diâmetro */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Descobrir diâmetro pelo perímetro</Text>
          <Text style={styles.caption}>D = P / π. Informe o perímetro externo em mm.</Text>
          <View style={styles.row}>
            <View style={styles.col}><Text>Perímetro (mm)</Text><TextInput value={perimetroMm} onChangeText={setPerimetroMm} keyboardType="numeric" style={styles.input} placeholder="Ex.: 7850" /></View>
          </View>
          <Text style={styles.result}>Diâmetro (mm): {diametroPorPerimetroMm != null ? Math.round(diametroPorPerimetroMm) : "—"}</Text>
          <View style={[styles.row, { marginTop: 8 }]}>
            {diametroPorPerimetroMm != null && (
              <Button title="Aplicar ao tanque" onPress={() => setDiametroMm(String(Math.round(diametroPorPerimetroMm)))} />
            )}
          </View>
        </View>

        {/* Consulta rápida / Tabela */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Altura a partir do volume</Text>
          <View style={styles.row}>
            <View style={styles.col}><Text>Volume (L)</Text><TextInput value={volumeConsultaL} onChangeText={setVolumeConsultaL} keyboardType="numeric" style={styles.input} /></View>
            <View style={styles.col}><Text>Passo da tabela (L)</Text><TextInput value={passoTabela} onChangeText={setPassoTabela} keyboardType="numeric" style={styles.input} /></View>
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Button title="Calcular altura" onPress={calcularAltura} />
            <Button title="Gerar tabela" onPress={gerarTabela} />
          </View>
          {alturaCalculadaMm !== null && <Text style={styles.result}>Altura: {Math.round(alturaCalculadaMm)} mm</Text>}
          <FlatList
            style={{ maxHeight: 220, marginTop: 8 }}
            data={tabela}
            keyExtractor={(item, idx) => String(idx)}
            renderItem={({ item }) => (
              <View style={styles.rowList}>
                <Text>{item.v} L</Text><Text>{item.h} mm</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.caption}>— sem dados —</Text>}
          />
        </View>

        {/* Calibração VEGA — A e B */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Calibração VEGA — Distâncias</Text>
          <Text style={styles.caption}>B = altura do produto (medição física) + distância do medidor → produto. A = B − nível útil (altura mm ou volume L).</Text>

          <Text style={{ marginTop: 6 }}>Altura do produto (mm) — medição física</Text>
          <TextInput value={alturaProdutoMm} onChangeText={setAlturaProdutoMm} keyboardType="numeric" style={styles.input} placeholder="Ex.: 3500" />

          <Text>Distância do medidor → produto (mm)</Text>
          <TextInput value={distMedidorProdutoMm} onChangeText={setDistMedidorProdutoMm} keyboardType="numeric" style={styles.input} placeholder="Ex.: 500" />

          <Text style={{ marginTop: 6 }}>Nível útil</Text>
          <View style={styles.row}>
            <View style={styles.col}><Text>Altura útil (mm) — opcional</Text><TextInput value={nivelUtilMm} onChangeText={setNivelUtilMm} keyboardType="numeric" style={styles.input} placeholder="Ex.: 3500" /></View>
            <View style={styles.col}><Text>Volume útil (L) — opcional</Text><TextInput value={nivelUtilVolumeL} onChangeText={setNivelUtilVolumeL} keyboardType="numeric" style={styles.input} placeholder="Ex.: 30000" /></View>
          </View>

          <Text style={{ marginTop: 6 }}>Identificação do medidor</Text>
          <View style={styles.row}>
            <View style={styles.col}><Text>Código do medidor</Text><TextInput value={codigoMedidor} onChangeText={setCodigoMedidor} keyboardType="default" style={styles.input} placeholder="Ex.: VEGAXXX-123" /></View>
            <View style={styles.col}><Text>Senha</Text><TextInput value={senhaMedidor} onChangeText={setSenhaMedidor} placeholder="Senha do medidor" style={styles.input} /></View>
          </View>

          <View style={[styles.resultBox, { marginTop: 10 }]}>
            <Text>Distância B (mín.): {distanciaBmm != null ? Math.round(distanciaBmm) + ' mm' : '—'}</Text>
            <Text>h útil (mm): {hUtilMm != null ? Math.round(hUtilMm) + ' mm' : '—'}</Text>
            <Text style={{ fontWeight: '700', marginTop: 6 }}>
              Distância A (máx.) = B − h: {
                distanciaAmm != null
                  ? (distanciaAmm >= 0 ? Math.round(distanciaAmm) + ' mm' : `verifique entradas (A negativo: ${Math.round(distanciaAmm)} mm)`)
                  : '—'
              }
            </Text>
          </View>

          <View style={[styles.row, { marginTop: 8 }]}>
            <Button title="Salvar calibração (sessão)" onPress={salvarCalibracaoSessao} />
          </View>
        </View>

        {/* Exportação visual (copiar manualmente) */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Exportar (visual)</Text>
          <Text style={styles.caption}>Mostramos o conteúdo na tela para você copiar e colar.</Text>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Button title={mostraCsv ? "Ocultar CSV" : "Ver CSV da Tabela"} onPress={() => setMostraCsv(v => !v)} />
            <Button title={mostraJson ? "Ocultar JSON" : "Ver JSON das Calibrações"} onPress={() => setMostraJson(v => !v)} />
          </View>
          {mostraCsv && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontWeight: "700" }}>{sanitizeFileName(fileNameBase)}.csv</Text>
              <Text selectable style={styles.codeBox}>{gerarCSV()}</Text>
            </View>
          )}
          {mostraJson && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontWeight: "700" }}>{sanitizeFileName(fileNameBase)}.json</Text>
              <Text selectable style={styles.codeBox}>{JSON.stringify(calibracoes, null, 2)}</Text>
            </View>
          )}
        </View>

        {/* Lista de calibrações (sessão) */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Calibrações salvas (sessão atual)</Text>
          <FlatList
            style={{ maxHeight: 320 }}
            data={calibracoes}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (
              <View style={styles.savedItem}>
                <Text style={{ fontWeight: '700' }}>
                  {item.quando?.replace('T',' ').slice(0,16)} — {item.tipo}
                </Text>
                <Text style={styles.caption}>
                  A={Math.round(item?.calculos?.distanciaAmm ?? NaN)} mm |
                  B={Math.round(item?.calculos?.distanciaBmm ?? NaN)} mm |
                  h={Math.round(item?.calculos?.hUtilMm ?? NaN)} mm
                </Text>
                <Text style={styles.caption}>Medidor: {item.medidor?.codigo || '—'}</Text>
                <Text style={styles.caption}>Arquivo base: {item.arquivoBase || '—'}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.caption}>— nenhuma calibração salva —</Text>}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 16, fontWeight: "600", marginBottom: 6 },
  caption: { color: "#666" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginTop: 4 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, marginTop: 12 },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  rowList: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  result: { fontWeight: "600", marginTop: 8 },
  resultBox: { backgroundColor: '#f7f7f7', padding: 10, borderRadius: 8 },
  savedItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  codeBox: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 8,
    padding: 8,
    fontFamily: "monospace",
  },
});

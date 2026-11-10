import { beforeEach, describe, expect, it } from "vitest";
import { useCodeReadingState } from "../codeReadingState";

beforeEach(() => useCodeReadingState.setState({ graphIdentity: undefined, passage: null, history: [], index: null }));
describe("reading position across sidebar and expanded viewer", () => {
  it("preserves location and Back history when the same graph is remounted", () => {
    const graph = {};
    const state = useCodeReadingState.getState();
    state.prepareForGraph(graph);
    state.setPassage({ start: 97, end: 97, filePath: "@library/scala/scala/Option.scala", scrollTop: 530 });
    state.setHistory([{ nodeId: "source", filePath: "source.scala", location: { line: 74, scrollTop: 400 } }]);
    state.setIndex({ version: 1, symbols: [], files: [], skipped: [] });
    useCodeReadingState.getState().prepareForGraph(graph);
    expect(useCodeReadingState.getState().passage).toMatchObject({ start: 97, scrollTop: 530 });
    expect(useCodeReadingState.getState().history).toHaveLength(1);
    expect(useCodeReadingState.getState().index).not.toBeNull();
  });
  it("does not carry source positions into a different project graph", () => {
    const state = useCodeReadingState.getState();
    state.prepareForGraph({}); state.setPassage({ start: 20, end: 30 });
    state.prepareForGraph({});
    expect(useCodeReadingState.getState().passage).toBeNull();
    expect(useCodeReadingState.getState().history).toEqual([]);
    expect(useCodeReadingState.getState().index).toBeNull();
  });
});

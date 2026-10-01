import { computeSurface } from "./pinnat.js?v=40";

self.onmessage = (event) => {
    const { id, name, args } = event.data;
    const result = computeSurface(name, args);
    const transfer = [result.normal.buffer, result.rough.buffer];
    if (result.color) transfer.push(result.color.buffer);
    self.postMessage({ id, result }, transfer);
};

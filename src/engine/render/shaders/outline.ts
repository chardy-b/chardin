/** Original four-neighbour crease/silhouette detector. Depth is linearized by
 * postprocessing's camera-aware helper; normals come from a real geometry pass. */
export const outlineFragment = /* glsl */ `
uniform sampler2D normalMap;
uniform vec2 texel;
uniform float depthStrength;
uniform float normalStrength;
float crease(vec2 uv, vec2 neighbour) {
  float centerDepth = readDepth(uv);
  float otherDepth = readDepth(neighbour);
  float z = abs(getViewZ(centerDepth));
  float otherZ = abs(getViewZ(otherDepth));
  float depthEdge = smoothstep(0.018, 0.065, abs(z - otherZ) / max(z, 0.1));
  vec3 n = texture2D(normalMap, uv).xyz * 2.0 - 1.0;
  vec3 otherN = texture2D(normalMap, neighbour).xyz * 2.0 - 1.0;
  float normalEdge = smoothstep(0.18, 0.48, length(n - otherN));
  normalEdge *= step(centerDepth, 0.9999) * step(otherDepth, 0.9999);
  return max(depthEdge * depthStrength, normalEdge * normalStrength);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float edge = max(max(crease(uv, uv + vec2(texel.x, 0.0)),
                       crease(uv, uv - vec2(texel.x, 0.0))),
                   max(crease(uv, uv + vec2(0.0, texel.y)),
                       crease(uv, uv - vec2(0.0, texel.y))));
  outputColor = vec4(mix(inputColor.rgb, vec3(0.035, 0.065, 0.05), clamp(edge, 0.0, 0.65)), inputColor.a);
}
`

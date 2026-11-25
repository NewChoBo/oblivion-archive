precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;

void main() {
    // Resolve the scene as opaque canvas pixels, including the distant sky.
    gl_FragColor = vec4(texture2D(textureSampler, vUV).rgb, 1.0);
}

// A custom card that actually looks like something
// Not like something good, mind you, but *something* at least.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class LightMapCard extends HTMLElement {
    constructor() {
        super();
        this.setupComplete = false;
        this.loadSvgContent();
    }
    loadSvgContent() {
        return __awaiter(this, void 0, void 0, function* () {
            if (LightMapCard.svgContent)
                return LightMapCard.svgContent;
            const response = yield fetch('http://localhost:5500/lighting.svg');
            const content = yield response.text();
            LightMapCard.svgContent = content;
            return content;
        });
    }
    setConfig(config) {
        return __awaiter(this, void 0, void 0, function* () {
            this._config = config;
            // Make sure this only runs once
            if (!this.setupComplete) {
                const content = LightMapCard.svgContent || (yield this.loadSvgContent());
                const card = document.createElement("ha-card");
                this.imageElement = document.createElement("svg");
                this.imageElement.innerHTML = content;
                card.appendChild(this.imageElement);
                this.appendChild(card);
                this.setupComplete = true;
            }
        });
    }
    set hass(hass) {
        this._hass = hass;
        // todo: update states
        Object.keys(hass.states)
            .filter(k => k.startsWith('light.'))
            .forEach(k => {
            this.updateLightState(hass.states[k]);
        });
    }
    updateLightState(state) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!this.imageElement)
            return;
        const gradients = this.imageElement.getElementsByClassName(state.entity_id);
        if (!(gradients === null || gradients === void 0 ? void 0 : gradients.length))
            return;
        for (let i = 0; i < gradients.length; i++) {
            const element = gradients[i];
            const brightness = ((_b = (_a = state.attributes) === null || _a === void 0 ? void 0 : _a.brightness) !== null && _b !== void 0 ? _b : (state.state == 'on' ? 255 : 0)) / 255;
            element.style.opacity = `${brightness * ((_d = (_c = this._config) === null || _c === void 0 ? void 0 : _c.maxBrightness) !== null && _d !== void 0 ? _d : 0.8)}`;
            if (!element.colorMapped) {
                element.colorMapped = true;
                const fillSelector = element.tagName == 'path'
                    ? element.getAttribute('fill')
                    : ((_e = element.getElementsByTagName('path')[0]) === null || _e === void 0 ? void 0 : _e.getAttribute('fill'));
                if (!fillSelector)
                    continue;
                const match = /^url\((.+)\)$/.exec(fillSelector);
                if (!match)
                    continue;
                const query = match[1];
                if (!query)
                    continue;
                const gradient = this.imageElement.querySelector(query);
                if (!gradient)
                    continue;
                element.gradient = gradient;
            }
            if (element.gradient && ((_g = (_f = state.attributes) === null || _f === void 0 ? void 0 : _f.rgb_color) === null || _g === void 0 ? void 0 : _g.length) == 3) {
                const color = state.attributes.rgb_color;
                const stops = element.gradient.getElementsByTagName('stop');
                for (let i = 0; i < stops.length; i++) {
                    const stop = stops[i];
                    stop.style.stopColor = `rgb(${color[0]},${color[1]},${color[2]})`;
                }
            }
        }
    }
}
customElements.define('light-map-card', LightMapCard);

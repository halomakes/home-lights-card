// A custom card that actually looks like something
// Not like something good, mind you, but *something* at least.

class LightMapCard extends HTMLElement {
  private _config: LightMapConfiguration;
  private setupComplete: boolean = false;
  private _hass: HomeAssistant;

  private imageElement?: HTMLElement;
  private static svgContent?: string;

  constructor() {
    super();
    this.loadSvgContent();
  }

  private async loadSvgContent(): Promise<string> {
    if (LightMapCard.svgContent)
      return LightMapCard.svgContent;
    const response = await fetch('http://localhost:5500/lighting.svg');
    const content = await response.text();
    LightMapCard.svgContent = content;
    return content;
  }

  async setConfig(config: LightMapConfiguration): Promise<void> {
    this._config = config;

    // Make sure this only runs once
    if (!this.setupComplete) {
      const content = LightMapCard.svgContent || await this.loadSvgContent();
      const card = document.createElement("ha-card");

      this.imageElement = document.createElement("svg");
      this.imageElement.innerHTML = content;
      card.appendChild(this.imageElement);

      this.appendChild(card);
      this.setupComplete = true;
    }
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;

    // todo: update states
    Object.keys(hass.states)
      .filter(k => k.startsWith('light.'))
      .forEach(k => {
        this.updateLightState(hass.states[k]);
      })
  }

  private updateLightState(state: LightState) {
    if (!this.imageElement)
      return;
    const gradients = this.imageElement.getElementsByClassName(state.entity_id);
    if (!gradients?.length)
      return;
    for (let i = 0; i < gradients.length; i++) {
      const element = gradients[i] as ColoredElement;
      const brightness = (state.attributes?.brightness ?? (state.state == 'on' ? 255 : 0)) / 255;
      element.style.opacity = `${brightness * (this._config?.maxBrightness ?? 0.8)}`;

      if (!element.colorMapped) {
        element.colorMapped = true;

        const fillSelector = element.tagName == 'path'
          ? element.getAttribute('fill')
          : (element.getElementsByTagName('path')[0]?.getAttribute('fill'));
        if (!fillSelector)
          continue;
        const match = /^url\((.+)\)$/.exec(fillSelector);
        if (!match)
          continue;
        const query = match[1];
        if (!query)
          continue;
        const gradient = this.imageElement.querySelector(query) as SVGGradientElement;
        if (!gradient)
          continue;
        element.gradient = gradient;
      }

      if (element.gradient && state.attributes?.rgb_color?.length == 3) {
        const color = state.attributes.rgb_color;
        const stops = element.gradient.getElementsByTagName('stop');
        for (let i = 0; i < stops.length; i++) {
          const stop = stops[i] as SVGStopElement;
          stop.style.stopColor = `rgb(${color[0]},${color[1]},${color[2]})`
        }
      }
    }
  }
}

type ColoredElement = SVGElement & {
  colorMapped: boolean,
  gradient: SVGGradientElement
}

type LightMapConfiguration = {
  maxBrightness: number;
};

type HomeAssistant = {
  states: { [key: string]: HassState },
  callService: (
    domain: HassDomain,
    serviceName: string,
    data: any
  ) => void
};

type HassState = any;

type HassDomain = 'light';

type State = {
  entity_id: string,
  state: string,
  context: StateContext,
  last_changed: string,
  last_updated: string
};

type StateContext = {
  id: string,
  parent_id?: string,
  user_id?: string,
};


type LightState = State & {
  attributes: LightAttributes
};

type LightAttributes = {
  supported_color_modes: ColorMode[],
  color_mode?: ColorMode,
  brightness?: number,
  icon: string,
  friendly_name: string,
  supported_features: number,
  color_temp_kelvin: any
  color_temp: any
  hs_color: number[]
  rgb_color: number[]
  xy_color: number[]
  rgbww_color: number[]
};

type ColorMode = 'brightness' | 'rgbww' | 'rgb' | 'color_temp';

customElements.define('light-map-card', LightMapCard);
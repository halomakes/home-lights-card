class LightMapCard extends HTMLElement {
  private _config: LightMapConfiguration;
  private imageSpawned: boolean = false;
  private buttonsSpawned: boolean = false;
  private _hass: HomeAssistant;

  private imageElement?: HTMLElement;
  private cardElement?: HTMLElement;
  private buttons: ButtonElement[] = [];
  private static svgContent?: string;
  private static defaultIcon = 'mdi:lightbulb';

  constructor() {
    super();
    this.loadSvgContent();
    window.addEventListener('resize', () => this.updateButtonPositions());
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;

    this.spawnButtons();
    this.updateLightStates();
  }

  async setConfig(config: LightMapConfiguration): Promise<void> {
    this._config = config;

    await this.spawnImage();
    this.updateScaling();
    this.updateButtonPositions();
  }

  connectedCallback(): void {
    this.updateButtonPositions();
  }

  private async loadSvgContent(): Promise<string> {
    if (LightMapCard.svgContent)
      return LightMapCard.svgContent;
    const response = await fetch('http://localhost:5500/lighting.svg');
    const content = await response.text();
    LightMapCard.svgContent = content;
    return content;
  }

  /**
   * Create the main svg content
   */
  private async spawnImage() {
    if (this.imageSpawned)
      return;
    const content = LightMapCard.svgContent || await this.loadSvgContent();
    this.cardElement = document.createElement("ha-card");
    this.cardElement.style.position = 'relative';

    this.imageElement = document.createElement("svg");
    this.imageElement.innerHTML = content;
    this.cardElement.appendChild(this.imageElement);

    this.appendChild(this.cardElement);
    this.imageSpawned = true;
  }

  /**
   * Create icons on the map for each light entity
   */
  private spawnButtons() {
    if (this.buttonsSpawned || !this.imageSpawned || !this._hass?.states || !this.cardElement)
      return; // wait for everything to be ready so we can get positions
    this.buttonsSpawned = true;

    const lightList = this.imageElement.getElementsByClassName('light');
    const entities: { [entityId: string]: SVGElement[] } = {};

    for (let i = 0; i < lightList.length; i++) {
      const element = lightList[i] as SVGElement;
      element.classList.forEach(c => {
        if (!c.startsWith('light.'))
          return;
        if (!entities[c])
          entities[c] = [];
        entities[c].push(element);
      });
    }

    for (let entityId of Object.keys(entities)) {
      const state = this._hass.states[entityId];
      if (!state)
        continue;
      this.buttons.push(this.createIcon(state, entities[entityId]));
    }
  }

  /**
   * Update the state of all mapped lights
   */
  private updateLightStates(): void {
    Object.keys(this._hass.states)
      .filter(k => k.startsWith('light.'))
      .forEach(k => {
        this.updateLight(this._hass.states[k]);
      })
  }

  private updateScaling(): void {
    if (this._config?.width && this.imageElement) {
      const sizeElement = this.imageElement.firstChild as SVGElement;
      sizeElement.setAttribute('width', this._config?.width);
      sizeElement.setAttribute('height', 'auto');
    }
  }

  private updateButtonPositions(): void {
    if (!this.isConnected)
      return;
    this.buttons.forEach(b => this.updateIconPosition(b));
  }

  /**
   * Update the brightness/color of all elements corresponding to a light
   * @param state The light state
   * @returns Nothing
   */
  private updateLight(state: LightState): void {
    if (!this.imageElement)
      return;
    const gradients = this.imageElement.getElementsByClassName(state.entity_id);
    if (!gradients?.length)
      return;
    for (let i = 0; i < gradients.length; i++) {
      const element = gradients[i] as ColoredElement;

      if (!element.colorMapped) {
        this.tryMapGradient(element);
      }
      this.updateDisplay(state, element);
    }
  }

  /**
   * Update the color/opacity of an element to match a hass light state
   * @param state State of the associated entity
   * @param element The element to update
   */
  private updateDisplay(state: LightState, element: ColoredElement) {
    const brightness = (state.attributes?.brightness ?? (state.state == 'on' ? 255 : 0)) / 255;
    element.style.opacity = `${brightness * (this._config?.maxBrightness ?? 1)}`;
    if (element.gradient && state.attributes?.rgb_color?.length == 3) {
      const color = state.attributes.rgb_color;
      const stops = element.gradient.getElementsByTagName('stop');
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i] as SVGStopElement;
        stop.style.stopColor = `rgb(${color[0]},${color[1]},${color[2]})`;
      }
    }
  }

  /**
   * Attempt to find the LinearGradient or RadialGradient for a path and attach it to the .gradient property
   * @param element the element to find the gradient for
   * @returns nothing
   */
  private tryMapGradient(element: ColoredElement): void {
    element.colorMapped = true;

    const fillSelector = element.tagName == 'path'
      ? element.getAttribute('fill')
      : (element.getElementsByTagName('path')[0]?.getAttribute('fill'));
    if (!fillSelector)
      return;
    const match = /^url\((.+)\)$/.exec(fillSelector);
    if (!match)
      return;
    const query = match[1];
    if (!query)
      return;
    const gradient = this.imageElement.querySelector(query) as SVGGradientElement;
    if (!gradient)
      return;
    element.gradient = gradient;
  }

  /**
   * Create a button linking to the light
   * @param entity The entity to link to
   * @param gradients The associated gradients on the map
   */
  private createIcon(entity: LightState, gradients: SVGElement[]): ButtonElement {
    const midpoint = this.calculateCenter(gradients);
    const html = `<ha-icon-button
                    class="map-light"
                    label="${entity.attributes?.friendly_name}"
                    title="Channelup"
                    data-entity="${entity.entity_id}"
                    style="position: absolute; top: ${midpoint.y}px; left: ${midpoint.x}px; transform: translateX(-50%) translateY(-50%);"
                  >
                    <ha-icon icon="${entity.attributes?.icon || LightMapCard.defaultIcon}"></ha-icon>  
                  </ha-icon-button>`;
    this.cardElement.insertAdjacentHTML('beforeend', html);
    const newElement = this.cardElement.lastChild as ButtonElement;
    newElement.addEventListener('click', () => this.openDetails(entity.entity_id));
    newElement.gradients = gradients;
    return newElement;
  }

  private updateIconPosition(button: ButtonElement): void {
    if (!button.gradients?.length)
      return;
    const midpoint = this.calculateCenter(button.gradients);
    button.style.left = `${midpoint.x}px`;
    button.style.top = `${midpoint.y}px`;
  }

  /**
   * Open the details dialog for a light
   * @param entityId The light's ID
   * @returns Event
   */
  private openDetails(entityId: string): HassMoreInfoEvent {
    const event = new Event('hass-more-info', {
      bubbles: true,
      cancelable: false,
      composed: true
    }) as HassMoreInfoEvent;
    event.detail = {
      entityId: entityId
    };
    this.cardElement.dispatchEvent(event);
    return event;
  }

  /**
   * Find the midpoint between all elements representing a light
   * @param input Gradients representing the light
   * @returns Midpoint
   */
  private calculateCenter(input: SVGElement[]): Cartesian {
    const calculateCenter = (single: SVGElement): Cartesian => {
      const parentRect = this.cardElement.getBoundingClientRect();
      const elementRect = single.getBoundingClientRect();

      return {
        y: elementRect.top - parentRect.top + (elementRect.height / 2),
        x: elementRect.left - parentRect.left + (elementRect.width / 2),
      };
    }

    return input
      .map(calculateCenter)
      .reduce((sum, value) => ({ x: sum.x + (value.x / input.length), y: sum.y + (value.y / input.length) }), { x: 0, y: 0 })
  }
}

type HassMoreInfoEvent = Event & {
  detail: {
    entityId: string
  }
};

type Cartesian = {
  x: number,
  y: number
};

type ButtonElement = HTMLElement & {
  gradients: SVGElement[]
};

type ColoredElement = SVGElement & {
  colorMapped: boolean,
  gradient: SVGGradientElement
};

type IconElement = HTMLAnchorElement & {
  entityId: string;
};

type LightMapConfiguration = {
  maxBrightness: number;
  width: string;
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
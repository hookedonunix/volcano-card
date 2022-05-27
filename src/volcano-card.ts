/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, svg, TemplateResult, css, PropertyValues, CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators';
import { classMap } from 'lit/directives/class-map';
import {
  HomeAssistant,
  hasAction,
  ActionHandlerEvent,
  handleAction,
  LovelaceCardEditor,
  getLovelace,
  EntityConfig,
  formatNumber,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers
import { mdiFire, mdiFan } from '@mdi/js';

import type { VolcanoCardConfig } from './types';
// import { actionHandler } from './action-handler-directive';
import { CARD_VERSION } from './const';
import { localize } from './localize/localize';

/* eslint no-console: 0 */
console.info(
  `%c  VOLCANO-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'volcano-card',
  name: 'Volcano Card',
  description: 'A template custom card for you to create something awesome',
});

// Parse array of entity objects from config
// export const processConfigEntities = <
//   T extends EntityConfig
// >(
//   entities: Record<string, T>,
//   checkEntityId = true
// ): T[] => {
//   if (!entities) {
//     throw new Error("Entities need to be an array");
//   }

//   return Object.values(entities); // .map((entityConf, index): T => {
//     if (
//       typeof entityConf === "object" &&
//       !Array.isArray(entityConf) &&
//       entityConf.type
//     ) {
//       return entityConf;
//     }

//     let config: T;

//     if (typeof entityConf === "string") {
//       config = { entity: entityConf as string } as T;
//     } else if (typeof entityConf === "object" && !Array.isArray(entityConf)) {
//       if (!("entity" in entityConf)) {
//         throw new Error(
//           `Entity object at position ${index} is missing entity field.`
//         );
//       }
//       config = entityConf as T;
//     } else {
//       throw new Error(`Invalid entity specified at position ${index}.`);
//     }

//     if (checkEntityId) {
//       throw new Error(
//         `Invalid entity ID at position ${index}: ${
//           (config as EntityConfig).entity
//         }`
//       );
//     }

//     return config;
//   });
// };

function hasConfigChanged(element: any, changedProps: PropertyValues): boolean {
  if (changedProps.has("config")) {
    return true;
  }

  const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
  if (!oldHass) {
    return true;
  }

  if (
    oldHass.connected !== element.hass!.connected ||
    oldHass.themes !== element.hass!.themes ||
    oldHass.locale !== element.hass!.locale ||
    oldHass.localize !== element.hass.localize ||
    oldHass.config.state !== element.hass.config.state
  ) {
    return true;
  }
  return false;
}

// Check if config or Entities changed
export function hasConfigOrEntitiesChanged(
  element: any,
  changedProps: PropertyValues
): boolean {
  if (hasConfigChanged(element, changedProps)) {
    return true;
  }

  const oldHass = changedProps.get("hass") as HomeAssistant;

  const entities = Object.values<string>(element.config!.entities); // processConfigEntities(element.config!.entities, false);

  return entities.some(entity => oldHass.states[entity] !== element.hass!.states[entity])

  // return entities.some(
  //   (entity) =>
  //     "entity" in entity &&
  //     oldHass.states[entity.entity] !== element.hass!.states[entity.entity]
  // );
}

@customElement('volcano-card')
export class VolcanoCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('volcano-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // TODO Add any properities that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private config!: VolcanoCardConfig;
  
  @state() private targetTemp!: number;

  private get water_heater() {
    if (!this.hass || !this.config.entities) {
      return null;
    }

    return this.hass.states[this.config.entities.water_heater];
  }

  private get heater_switch() {
    if (!this.hass || !this.config.entities) {
      return null;
    }

    return this.hass.states[this.config.entities.heater_switch];
  }

  private get pump_switch() {
    if (!this.hass || !this.config.entities) {
      return null;
    }

    return this.hass.states[this.config.entities.pump_switch];
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: VolcanoCardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    this.config = {
      name: 'Volcano',
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    return hasConfigOrEntitiesChanged(this, changedProps);
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);

    if (!this.hass || !this.config || !changedProps.has("hass")) {
      return;
    }

    if (this.water_heater) {
      this.targetTemp = this.water_heater.attributes.temperature
    }
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (
      !this.config ||
      !this.hass ||
      (!changedProps.has("hass") && !changedProps.has("config"))
    ) {
      return;
    }

    const oldHass = changedProps.get("hass");

    if (!this.water_heater) {
      return;
    }

    if (!oldHass || oldHass.states[this.config.entities.water_heater] !== this.water_heater) {
      this._rescaleSvg();
    }
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    // TODO Check for stateObj or other necessary things and render a warning if missing
    if (this.config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    if (this.config.show_error) {
      return this._showError(localize('common.show_error'));
    }

    const stateObj = this.water_heater!;

    const mode = stateObj.state ?? 'unknown-mode';

    const targetTemp = 
      stateObj.attributes.temperature !== null &&
      Number.isFinite(Number(stateObj.attributes.temperature))
        ? stateObj.attributes.temperature
        : stateObj.attributes.min_temp;

    const slider = html`
      <round-slider
        .value=${targetTemp}
        .min=${stateObj.attributes.min_temp}
        .max=${stateObj.attributes.max_temp}
        step=1
        @value-changing=${this._dragEvent}
        @value-changed=${this._setTemperature}
      ></round-slider>
    `;

    const currentTemperature = svg`
      <svg viewBox="0 0 40 20">
        <text
          x="50%"
          dx="1"
          y="60%"
          text-anchor="middle"
          style="font-size: 13px;"
        >
        ${
          stateObj.attributes.current_temperature !== null &&
          !isNaN(stateObj.attributes.current_temperature)
            ? svg`${formatNumber(
                stateObj.attributes.current_temperature,
                this.hass.locale
              )}
              <tspan dx="-3" dy="-6.5" style="font-size: 4px;">
                ${this.hass.config.unit_system.temperature}
              </tspan>`
            : ""
        }
      </text>
    </svg>
    `;

    const setValues = svg`
      <svg id="set-values">
        <g>
          <text text-anchor="middle" class="set-value">
            ${formatNumber(this.targetTemp, this.hass.locale, { maximumFractionDigits: 0 })}
          </text>
        </g>
      </svg>
    `;

    return html`
      <ha-card
        class=${classMap({
          [mode]: true,
        })}
      >
        <div class="content">
          <div id="controls">
            <div id="slider">
              ${slider}
              <div id="slider-center">
                <div id="temperature">${currentTemperature} ${setValues}</div>
              </div>
            </div>
          </div>
          <div id="info">
            <div id="modes">
              ${this._renderSwitch(this.heater_switch, mdiFire)}
              ${this._renderSwitch(this.pump_switch, mdiFan)}
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _dragEvent(e) {
    this.targetTemp = e.detail.value;
  }

  private _setTemperature(e) {
    this.hass.callService('water_heater', 'set_temperature', {
      entity_id: this.water_heater!.entity_id,
      temperature: e.detail.value
    })
  }

  private _renderSwitch(entity, icon) {
    return html`
      <ha-icon-button
        tabindex="0"
        class=${classMap({ 'selected-icon': entity.state === 'on' })}
        .path=${icon}
        .switch=${entity.entity_id}
        @click=${this._handleAction}
      ></ha-icon-button>
    `;
  }

  private _handleAction(e: Event & { currentTarget: { switch: string }}): void {
    const entity = e.currentTarget?.switch;

    this.hass.callService("switch", "toggle", {
      entity_id: entity,
    });
  }

  private _showWarning(warning: string): TemplateResult {
    return html` <hui-warning>${warning}</hui-warning> `;
  }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });

    return html` ${errorCard} `;
  }

  private _rescaleSvg() {
    const card = this.renderRoot.querySelector('ha-card') as LitElement;

    if (card) {
      card.updateComplete.then(() => {
        setTimeout(() => {
          const svgRoot = this.shadowRoot!.querySelector("#set-values")!;
          const box = svgRoot.querySelector("g")!.getBBox();
          svgRoot.setAttribute(
            "viewBox",
            `${box.x} ${box.y} ${box.width} ${box.height}`
          );
          svgRoot.setAttribute("width", `${box.width}`);
          svgRoot.setAttribute("height", `${box.height}`);
        }, 10);
      });
    }
  }


  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css`
      .electric,
      .heat_pump {
        --mode-color: var(--state-climate-heat-color);
      }

      ha-card {
        height: 100%;
        position: relative;
        overflow: hidden;
      }

      .content {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      #controls {
        display: flex;
        justify-content: center;
        padding: 16px;
        position: relative;
      }

      round-slider {
        --round-slider-path-color: var(--slider-track-color);
        --round-slider-bar-color: var(--mode-color);
        padding-bottom: 10%;
      }

      #slider {
        height: 100%;
        width: 100%;
        position: relative;
        max-width: 250px;
        min-width: 100px;
      }

      #slider-center {
        position: absolute;
        width: calc(100% - 40px);
        height: calc(100% - 40px);
        box-sizing: border-box;
        border-radius: 100%;
        top: 20px;
        left: 20px;
        text-align: center;
        overflow-wrap: break-word;
        pointer-events: none;
      }

      #temperature {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 100%;
        height: 50%;
        top: 45%;
        left: 50%;
      }

      #set-values {
        max-width: 80%;
        transform: translate(0, -50%);
        font-size: 20px;
      }

      #info {
        display: flex-vertical;
        justify-content: center;
        text-align: center;
        padding: 16px;
        margin-top: -60px;
        font-size: var(--name-font-size);
      }

      #modes > * {
        color: var(--disabled-text-color);
        cursor: pointer;
        display: inline-block;
      }

      #modes .selected-icon {
        color: var(--state-climate-heat-color);
      }

      text {
        fill: var(--primary-text-color);
      }
    `;
  }
}

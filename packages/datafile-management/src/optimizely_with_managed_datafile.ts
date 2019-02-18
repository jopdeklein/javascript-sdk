// TODO: create logger module containing a singleton, setLogger & getLogger. expose setLogger & getLogger as top-level exports of datafile-management package. Later this would be replaced.

import { Client, Config, EventTags, UserAttributes } from '@optimizely/optimizely-sdk'
import { Datafile, DatafileManager, DatafileManagerConfig } from './datafile_manager_types'
import createStaticDatafileManager from './static_datafile_manager'
import createDefaultClient from './default_client'
import { default as EventEmitter, Listener, ListenerDisposer } from './event_emitter';

interface ManagedConfig extends Partial<Config> {
  sdkKey?: string
  // TODO: datafileManagerOptions
  /*
    // {
      // getUrl,
      // liveUpdates // boolean
      // updateInterval // number
      // maxCacheAge // number

  // }
  */
}

export interface OptimizelyWithManagedDatafileConfig {
  clientConfig: Partial<Config>
  createDatafileManager: (config: DatafileManagerConfig) => DatafileManager
  createInstance: (config: Config) => Client
  datafile?: Datafile
  sdkKey?: string
}

const DATAFILE_UPDATE_EVT = 'datafileUpdate'

class OptimizelyWithManagedDatafile implements Client {
  // TODO: Function that accepts a timeout, returns a Promise
  readonly onReady: Promise<void>

  private readonly datafileManager: DatafileManager | undefined

  private client: Client

  private datafileListenerDisposer: ListenerDisposer | undefined

  private readonly emitter: EventEmitter

  private readonly createInstance: (config: Config) => Client

  constructor(config: OptimizelyWithManagedDatafileConfig) {
    const {
      clientConfig,
      createInstance,
      datafile,
      createDatafileManager,
      sdkKey,
    } = config

    this.emitter = new EventEmitter()

    this.createInstance = createInstance

    this.client = createDefaultClient()

    if (sdkKey) {
      // TODO: Provide ability to pass through datafile manager options
      this.datafileManager = createDatafileManager({ sdkKey, datafile })
    } else if (datafile) {
      this.datafileManager = createStaticDatafileManager(datafile)
    } else {
      // TODO: Log? Reject with error message str?
      this.onReady = Promise.reject()
      return
    }

    this.datafileManager.start()

    const datafileFromManager = this.datafileManager.get()
    if (datafileFromManager) {
      this.setupClient(datafileFromManager, clientConfig)
      this.onReady = Promise.resolve()
    } else {
      this.onReady = this.datafileManager.onReady.then(freshDatafile => {
        this.setupClient(freshDatafile, clientConfig)
      })
    }

    // TODO: Should log or throw error if clientConfig contains datafile, which won't be used?
    // Or, use it and dont put datafile in the main config?

    // TODO: Need to do runtime config validation because we get consumed by regular JS?

    // TODO: Logging
  }

  activate(
    experimentKey: string,
    userId: string,
    attributes?: UserAttributes,
  ): string | null {
    return this.client.activate(experimentKey, userId, attributes)
  }

  getVariation(
    experimentKey: string,
    userId: string,
    attributes?: UserAttributes,
  ): string | null {
    return this.client.getVariation(experimentKey, userId, attributes)
  }

  track(
    eventKey: string,
    userId: string,
    attributes?: UserAttributes,
    eventTags?: EventTags,
  ): void {
    return this.client.track(eventKey, userId, attributes, eventTags)
  }

  isFeatureEnabled(
    feature: string,
    userId: string,
    attributes?: UserAttributes,
  ): boolean {
    return this.client.isFeatureEnabled(feature, userId, attributes)
  }

  getEnabledFeatures(userId: string, attributes?: UserAttributes): Array<string> {
    return this.client.getEnabledFeatures(userId, attributes)
  }

  getFeatureVariableString(
    feature: string,
    variable: string,
    userId: string,
    attributes?: UserAttributes,
  ): string | null {
    return this.client.getFeatureVariableString(feature, variable, userId, attributes)
  }

  getFeatureVariableBoolean(
    feature: string,
    variable: string,
    userId: string,
    attributes?: UserAttributes,
  ): boolean | null {
    return this.client.getFeatureVariableBoolean(feature, variable, userId, attributes)
  }

  getFeatureVariableInteger(
    feature: string,
    variable: string,
    userId: string,
    attributes?: UserAttributes,
  ): number | null {
    return this.client.getFeatureVariableInteger(feature, variable, userId, attributes)
  }

  getFeatureVariableDouble(
    feature: string,
    variable: string,
    userId: string,
    attributes?: UserAttributes,
  ): number | null {
    return this.client.getFeatureVariableDouble(feature, variable, userId, attributes)
  }

  getForcedVariation(experiment: string, userId: string): string | null {
    return this.client.getVariation(experiment, userId)
  }

  setForcedVariation(
    experiment: string,
    userId: string,
    variationKey: string,
  ): boolean {
    return this.client.setForcedVariation(experiment, userId, variationKey)
  }

  get notificationCenter() {
    return this.client.notificationCenter
  }

  get isValidInstance() {
    return this.client.isValidInstance
  }

  close(): void {
    if (this.datafileListenerDisposer) {
      this.datafileListenerDisposer()
    }
    if (this.datafileManager) {
      this.datafileManager.stop()
    }
  }

  private setupClient(datafile: Datafile, clientConfig: Partial<Config>): void {
    const nextClient = this.createInstance({
      ...clientConfig,
      datafile,
    })

    if (nextClient.isValidInstance) {
      this.client = nextClient
      // TODO: Should emit datafile?
      this.emitter.emit(DATAFILE_UPDATE_EVT)
    } // TODO: else log error

    if (this.datafileManager) {
      this.datafileListenerDisposer = this.datafileManager.onUpdate(nextDatafile => {
        const nextClient = this.createInstance({
          ...clientConfig,
          datafile: nextDatafile,
        })
        if (nextClient.isValidInstance) {
          this.client = nextClient
          // TODO: Should emit datafile?
          this.emitter.emit(DATAFILE_UPDATE_EVT)
        } // TODO: else log error
      })
    }
  }

  on(eventName: string, listener: Listener): ListenerDisposer {
    return this.emitter.on(eventName, listener)
  }
}

export default function create(
  createInstance: (config: Config) => Client,
  createDatafileManager: (config: DatafileManagerConfig) => DatafileManager,
  config: ManagedConfig
): OptimizelyWithManagedDatafile {
  return new OptimizelyWithManagedDatafile({
    clientConfig: config,
    createDatafileManager,
    createInstance,
    datafile: config.datafile,
    sdkKey: config.sdkKey,
  })
}

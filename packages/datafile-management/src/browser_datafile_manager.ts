import { Datafile, DatafileManager, DatafileUpdateListener } from './datafile_manager_types'
import EventEmitter from './event_emitter';

const GET_METHOD = 'GET'
const READY_STATE_COMPLETE = 4
const POLLING_INTERVAL = 5000

function defaultUrlBuilder(sdkKey: string): string {
  return `https://cdn.optimizely.com/datafiles/${sdkKey}.json`
}

const enum ManagerStatus {
  INITIAL = "initial",
  STARTED = "started",
  STOPPED = "stopped",
}

interface ManagerOptions {
  urlBuilder?: (sdkKey: string) => string
}

const UPDATE_EVT = 'update'

class BrowserDatafileManager implements DatafileManager {
  readonly onReady: Promise<Datafile>

  private sdkKey: string

  private urlBuilder: (sdkKey: string) => string

  private emitter: EventEmitter

  private currentDatafile: Datafile | null

  private pollingInterval: number | undefined

  private status: ManagerStatus

  constructor(sdkKey: string, { urlBuilder = defaultUrlBuilder }: ManagerOptions = {}) {
    this.sdkKey = sdkKey
    this.urlBuilder = urlBuilder
    this.emitter = new EventEmitter()
    this.currentDatafile = null
    this.status = ManagerStatus.INITIAL
    // TODO: Only fetch when start is called
    this.onReady = this.fetchAndUpdateCurrentDatafile()
  }

  get() {
    return this.currentDatafile
  }

  onUpdate(listener: DatafileUpdateListener) {
    return this.emitter.on(UPDATE_EVT, listener)
  }

  // TODO: Ugly
  start() {
    if (this.status === ManagerStatus.STARTED) {
      return
    }

    this.status = ManagerStatus.STARTED

    this.onReady.then(() => {
      if (this.status === ManagerStatus.STARTED) {
        this.startPolling()
      }
    })
  }

  stop() {
    this.status = ManagerStatus.STOPPED
    if (typeof this.pollingInterval !== 'undefined') {
      clearInterval(this.pollingInterval)
    }
  }

  // TODO: Better error handling, reject reasons/messages
  private fetchAndUpdateCurrentDatafile(): Promise<Datafile> {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest()
      req.open(GET_METHOD, this.urlBuilder(this.sdkKey), true)
      req.onreadystatechange = () => {
        if (req.readyState === READY_STATE_COMPLETE) {
          if (req.status >= 400) {
            reject('Datafile response error')
            return
          }

          let datafile: Datafile
          const responseText: string = req.responseText
          try {
            datafile = JSON.parse(responseText)
          } catch (e) {
            reject('Datafile parse error')
            return
          }

          this.currentDatafile = datafile

          resolve(datafile)
        }
      }
      req.send()
    })
  }

  // TODO: Ugly
  private startPolling(): void {
    this.pollingInterval = window.setInterval(() => {
      if (this.status === ManagerStatus.STARTED) {
        this.fetchAndUpdateCurrentDatafile().then((datafile: Datafile) => {
          if (this.status === ManagerStatus.STARTED) {
            this.emitter.emit(UPDATE_EVT, datafile)
          }
        })
      }
    }, POLLING_INTERVAL)
  }
}

export default function create(sdkKey: string, options?: ManagerOptions) {
  return new BrowserDatafileManager(sdkKey, options)
}
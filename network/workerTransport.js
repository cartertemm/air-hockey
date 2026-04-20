export class WorkerTransport {
	constructor(worker, target) {
		this._worker = worker;
		this._target = target;
		this._onMessage = null;
		this._onClose = null;
		this._listener = (event) => {
			if (event.data?.target === this._target) {
				this._onMessage?.(event.data.msg);
			}
		};
		this._worker.addEventListener('message', this._listener);
	}

	send(msg) {
		this._worker.postMessage({ target: this._target, msg });
	}

	close() {
		this._worker.removeEventListener('message', this._listener);
		this._worker.terminate();
		this._onClose?.();
	}

	onMessage(cb) {
		this._onMessage = cb;
	}

	onClose(cb) {
		this._onClose = cb;
	}
}

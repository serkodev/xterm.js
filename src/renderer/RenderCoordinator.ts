/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IRenderer } from './Types';
import { RenderDebouncer } from '../ui/RenderDebouncer';
import { EventEmitter2, IEvent } from '../common/EventEmitter2';
import { Disposable } from '../common/Lifecycle';
import { ScreenDprMonitor } from '../../lib/ui/ScreenDprMonitor';
import { addDisposableDomListener } from '../ui/Lifecycle';

export class RenderCoordinator extends Disposable {
  private _renderDebouncer: RenderDebouncer;
  private _screenDprMonitor: ScreenDprMonitor;

  private _isPaused: boolean = false;
  private _needsFullRefresh: boolean = false;
  private _canvasWidth: number = 0;
  private _canvasHeight: number = 0;

  private _onCanvasResize = new EventEmitter2<{ width: number, height: number }>();
  public get onCanvasResize(): IEvent<{ width: number, height: number }> { return this._onCanvasResize.event; }
  private _onRender = new EventEmitter2<{ start: number, end: number }>();
  public get onRender(): IEvent<{ start: number, end: number }> { return this._onRender.event; }

  constructor(
    private _renderer: IRenderer,
    private _rowCount: number,
    screenElement: HTMLElement
  ) {
    super();
    this._renderDebouncer = new RenderDebouncer((start, end) => this._renderRows(start, end));
    this.register(this._renderDebouncer);

    this._screenDprMonitor = new ScreenDprMonitor();
    this._screenDprMonitor.setListener(() => this._renderer.onDevicePixelRatioChange());
    this.register(this._screenDprMonitor);

    // dprchange should handle this case, we need this as well for browsers that don't support the
    // matchMedia query.
    this.register(addDisposableDomListener(window, 'resize', () => this._renderer.onDevicePixelRatioChange()));

    // Detect whether IntersectionObserver is detected and enable renderer pause
    // and resume based on terminal visibility if so
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(e => this._onIntersectionChange(e[e.length - 1]), { threshold: 0 });
      observer.observe(screenElement);
      this.register({ dispose: () => observer.disconnect() });
    }
  }

  private _onIntersectionChange(entry: IntersectionObserverEntry): void {
    this._isPaused = entry.intersectionRatio === 0;
    if (!this._isPaused && this._needsFullRefresh) {
      this.refreshRows(0, this._rowCount - 1);
      this._needsFullRefresh = false;
    }
  }

  public refreshRows(start: number, end: number): void {
    if (this._isPaused) {
      this._needsFullRefresh = true;
      return;
    }
    this._renderDebouncer.refresh(start, end, this._rowCount);
  }

  private _renderRows(start: number, end: number): void {
    this._renderer.renderRows(start, end);
    this._onRender.fire({ start, end });
  }

  public resize(cols: number, rows: number): void {
    this._rowCount = rows;
    this._fireOnCanvasResize();
  }

  public changeOptions(): void {
    this._renderer.onOptionsChanged();
    this._fireOnCanvasResize();
  }

  private _fireOnCanvasResize(): void {
    // Don't fire the event if the dimensions haven't changed
    if (this._renderer.dimensions.canvasWidth === this._canvasWidth && this._renderer.dimensions.canvasHeight === this._canvasHeight) {
      return;
    }
    this._canvasWidth = this._renderer.dimensions.canvasWidth;
    this._canvasHeight = this._renderer.dimensions.canvasHeight;
    this._onCanvasResize.fire({
      width: this._canvasWidth,
      height: this._canvasHeight
    });
  }

  public setRenderer(renderer: IRenderer): void {
    this._renderer = renderer;
  }
}

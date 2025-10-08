import { vi } from 'vitest';

class MockCanvasContext {
  public readonly canvas: { width: number; height: number };
  public fillStyle: unknown = null;
  public strokeStyle: unknown = null;
  public shadowColor = '';
  public shadowBlur = 0;
  public lineWidth = 1;
  public font = '10px sans-serif';
  public textAlign: 'left' | 'right' | 'center' | 'start' | 'end' = 'left';
  public textBaseline:
    | 'top'
    | 'hanging'
    | 'middle'
    | 'alphabetic'
    | 'ideographic'
    | 'bottom' = 'alphabetic';
  public globalCompositeOperation = 'source-over';

  public constructor(width: number, height: number) {
    this.canvas = { width, height };
  }

  public save(): void {}
  public restore(): void {}
  public scale(_x: number, _y: number): void {}
  public translate(_x: number, _y: number): void {}
  public rotate(_angle: number): void {}
  public beginPath(): void {}
  public closePath(): void {}
  public moveTo(_x: number, _y: number): void {}
  public lineTo(_x: number, _y: number): void {}
  public quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number): void {}
  public bezierCurveTo(
    _cp1x: number,
    _cp1y: number,
    _cp2x: number,
    _cp2y: number,
    _x: number,
    _y: number,
  ): void {}
  public arc(
    _x: number,
    _y: number,
    _radius: number,
    _startAngle: number,
    _endAngle: number,
    _counterclockwise?: boolean,
  ): void {}
  public fillRect(_x: number, _y: number, _width: number, _height: number): void {}
  public clearRect(_x: number, _y: number, _width: number, _height: number): void {}
  public stroke(): void {}
  public fill(): void {}
  public clip(): void {}
  public createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
  public createRadialGradient(
    _x0: number,
    _y0: number,
    _r0: number,
    _x1: number,
    _y1: number,
    _r1: number,
  ): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
  public createPattern(
    _image: unknown,
    _repetition: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat',
  ): null {
    return null;
  }
  public drawImage(
    _image: unknown,
    _dx: number,
    _dy: number,
    _dw?: number,
    _dh?: number,
  ): void {}
  public fillText(_text: string, _x: number, _y: number, _maxWidth?: number): void {}
  public measureText(_text: string): { width: number } {
    return { width: 0 };
  }
}

class MockCanvas {
  public constructor(private readonly width: number, private readonly height: number) {}

  public getContext(_type: '2d'): MockCanvasContext {
    return new MockCanvasContext(this.width, this.height);
  }

  public toBuffer(): Buffer {
    return Buffer.alloc(0);
  }
}

vi.mock('@napi-rs/canvas', () => ({
  createCanvas: (width: number, height: number) => new MockCanvas(width, height),
  loadImage: async () => ({ width: 1, height: 1 }),
}));

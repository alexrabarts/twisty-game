import { jest } from '@jest/globals';

// Mock Three.js for unit tests
global.THREE = {
  Vector3: class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    
    distanceTo(v) {
      const dx = this.x - v.x;
      const dy = this.y - v.y;
      const dz = this.z - v.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    clone() {
      return new THREE.Vector3(this.x, this.y, this.z);
    }
  },
  
  Group: class Group {
    constructor() {
      this.position = new THREE.Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.children = [];
    }
    
    add(child) {
      this.children.push(child);
    }
  },
  
  Mesh: class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.position = new THREE.Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.castShadow = false;
      this.receiveShadow = false;
    }
  },
  
  BoxGeometry: class BoxGeometry {
    constructor(width, height, depth) {
      this.width = width;
      this.height = height;
      this.depth = depth;
    }
  },
  
  CylinderGeometry: class CylinderGeometry {
    constructor(radiusTop, radiusBottom, height, segments) {
      this.radiusTop = radiusTop;
      this.radiusBottom = radiusBottom;
      this.height = height;
      this.segments = segments;
    }
  },
  
  MeshStandardMaterial: class MeshStandardMaterial {
    constructor(params = {}) {
      Object.assign(this, params);
    }
  },
  
  Scene: class Scene {
    constructor() {
      this.children = [];
    }
    
    add(child) {
      this.children.push(child);
    }
  },
  
  Clock: class Clock {
    constructor() {
      this.startTime = Date.now();
      this.oldTime = this.startTime;
      this.elapsedTime = 0;
    }
    
    getDelta() {
      const now = Date.now();
      const diff = (now - this.oldTime) / 1000;
      this.oldTime = now;
      this.elapsedTime += diff;
      return diff;
    }
  }
};

// Mock window and document objects
global.window = {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

global.document = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  getElementById: jest.fn((id) => {
    return { 
      innerHTML: '',
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn()
      }
    };
  }),
  querySelector: jest.fn(),
  body: {
    appendChild: jest.fn()
  }
};

// Mock localStorage
global.localStorage = {
  storage: {},
  getItem: jest.fn((key) => global.localStorage.storage[key] || null),
  setItem: jest.fn((key, value) => {
    global.localStorage.storage[key] = value.toString();
  }),
  removeItem: jest.fn((key) => {
    delete global.localStorage.storage[key];
  }),
  clear: jest.fn(() => {
    global.localStorage.storage = {};
  })
};

// Mock performance
global.performance = {
  now: jest.fn(() => Date.now())
};
// The tests read the model files with js/sceneassets.js, which decodes a file's maps (a detailed bike's baked maps)
// with the browser's createImageBitmap. Node has none: a stand-in gives each image its byte count, as
// tests/unit/sceneassets.test.js does for the rocks
if (typeof globalThis.createImageBitmap !== 'function') {
  globalThis.createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size, close() {} });
}

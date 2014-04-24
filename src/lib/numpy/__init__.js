var $builtinmodule = function(name)
{
  var math = Sk.interop['mathjs']();
  var mod = {};
  
  function toNativeArray(value) {
    if(Object.prototype.toString.call(value.v) === '[object Array]') {
      var result = [];
      var idx;
        
      for(idx = 0; idx < value.v.length; ++idx) {
        result[idx] = toNativeArray(value.v[idx]);
      }
      
      return result;
    } else {
      return value.v;
    }
  };
  
  // transform tuple/slices to index arrays
  function toNativeIndex(idx) {
    if(idx.tp$name === 'tuple') {
      var result = [];
      var i, submatrix = false, indices = [];
      
      for(i = 0; i < idx.v.length; ++i) {
        var tmp = toNativeIndex(idx.v[i]);
        
	    submatrix = submatrix || tmp.submatrix;
	    indices = indices.concat(tmp.indices);
      }
      
      return { 'submatrix': submatrix, 'indices': indices };
    } else {
      if(idx.tp$name === 'number') {
        return { submatrix: false, indices: [idx.v]};
      }
      
      if(idx.tp$name === 'slice') {
        return { submatrix: true, indices: [new math.type.Range(idx.start.v, idx.stop.v, idx.step.v !== null ? idx.step.v : 1)] };
      }
    }
  }
  
  // convert a linear index to a mathjs index array
  function linearToNativeIndex(size, idx) {
    var i, remainder = idx, total = 1, indices = [];
     
    for(i = size.length - 1; i >= 0 ; --i) {
      indices[i] = remainder % size[i];
      remainder = Math.floor(remainder / size[i]);
      total *= size[i];
    }
    
    return { 'indices': indices, 'total': total };
  }
  
  // translate negative indices/add missing dimensions
  function normalizeNativeIndex(size, idx) {
    if(size.length < idx.indices.length) {
      throw new Sk.builtin.IndexError('invalid index (number of indices is larger than ndarray.ndims)');
    }
    
    var i;
    for(i = 0; i < idx.indices.length; ++i) {
      if(math.type.Range.isRange(idx.indices[i])) {
        // clamp range
        if(idx.indices[i].end > size[i]) {
          idx.indices[i].end = size[i];
        }
      } else {
        // translate negative indices
        if(idx.indices[i] < 0) {
          idx.indices[i] = size[i] + idx.indices[i];
        }
      }
    }
    
    // add missing dimensions
    if(size.length > idx.indices.length) {
      var i;
      for(i = idx.indices.length; i < size.length; ++i) {
        if(size[i] > 1) {
          idx.indices[i] = new math.type.Range(0, size[i]);
          idx.submatrix = true
        } else {
          idx.indices[i] = 0;
        }
      }
    }
    
    return idx;
  }
  
  /**
   * ndarray class
   TODO:can we make it iterable? 
   */
  var ndarray = function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, shape, data) {
      Sk.builtin.pyCheckArgs('numpy.ndarray.__init__', arguments, 2, 3);
      
      if(shape !== undefined) {
      
        try {
          self.v = math.matrix(toNativeArray(data));
        } catch(e) {
          throw new Sk.builtin.Exception(e.message);
        }
        
        // TODO: check shape
      } else {
        // TODO: better implementation of wrapping mathjs object in python ndarray
        self.v = data;
      }
    });
    
    $loc.__getitem__ = new Sk.builtin.func(function(self, key) {
      var idx = normalizeNativeIndex(self.v.size(), toNativeIndex(key));
    
      try {
        if(idx.submatrix) {
          return Sk.misceval.callsim(mod.ndarray, undefined, self.v.subset(math.type.Index.create(idx.indices)));
        } else {
          return Sk.builtin.nmber(self.v.get(idx.indices), Sk.builtin.nmber.float$);
        }
      } catch(e) {
        throw new Sk.builtin.Exception(e.message);
      }
    });
    
    $loc.__setitem__ = new Sk.builtin.func(function(self, key, value) { 
      var idx = normalizeNativeIndex(self.v.size(), toNativeIndex(key));
    
      if(idx.submatrix) {
        // TODO: implement submatrix assignment      
      } else {
        try {   
          self.v.set(idx.indices, value.v);
        } catch(e) {
          throw new Sk.builtin.Exception(e.message);
        }
      }
    });
    
    $loc.__add__ = new Sk.builtin.func(function(self, other) {
      return Sk.misceval.callsim(mod.add, self, other);
    });
    
    $loc.__sub__ = new Sk.builtin.func(function(self, other) {
      return Sk.misceval.callsim(mod.sub, self, other);
    });
    
    $loc.__mul__ = new Sk.builtin.func(function(self, other) {
      return Sk.misceval.callsim(mod.multiply, self, other);
    });
    $loc.__rmul__ = $loc.__mul__;
    
    $loc.__div__ = new Sk.builtin.func(function(self, other) {
      return Sk.misceval.callsim(mod.div, self, other);
    });
    /*
     * TODO: Skulpt doesn't call __pos__
    $loc.__pos__ = new Sk.builtin.func(function(self) {
      return self;
    });
    */
    $loc.nb$positive = function() {
      return this;
    };
    /*
     * TODO: Skulpt doesn't call __neg__
    $loc.__neg__ = new Sk.builtin.func(function(self) {
      return Sk.misceval.callsim(mod.ndarray, undefined, math.unary(self.v));
    });
    */
    $loc.nb$negative = function() {
      return Sk.misceval.callsim(mod.ndarray, undefined, math.unary(this.v));
    };
    
    $loc.transpose = new Sk.builtin.func(function(self) {
      return Sk.misceval.callsim(mod.transpose, self);
    });
        
    $loc.T = new Sk.builtin.func(function(self) {
      return Sk.misceval.callsim(mod.transpose, self);
    });
    
    $loc.inv = new Sk.builtin.func(function(self) {
      return Sk.misceval.callsim(mod.inv, self);
    });
    
    $loc.item = new Sk.builtin.func(function(self, key) {
      var idx = { submatrix: false, indices: [] };
      
      if(key === undefined) {
        var tmp = linearToNativeIndex(self.v.size(), 0)
        
        if(tmp.total !== 1) {
          throw new Sk.builtin.ValueError('can only convert an array  of size 1 to a Python scalar');
        }
        
        idx.indices = tmp.indices;
      } else if(key.tp$name === 'number' && key.skType == 'int') {
        var tmp = linearToNativeIndex(self.v.size(), key.v)
        
        if(key.v < 0 || key.v >= tmp.total) {
          throw new Sk.builtin.ValueError('index out of bounds');
        }
        
        idx.indices = tmp.indices;
      } else if(key.tp$name === 'tuple') {
        idx = normalizeNativeIndex(self.v.size(), toNativeIndex(key));
      } else {
        throw new Sk.builtin.Exception('invalid index argument of type "' + key.tp$name + '" for ndarray.item()!');
      }
      
      if(idx.submatrix) {
        throw new Sk.builtin.Exception('ndarray.item() can only be used to access scalar values!');
      }
      
      try {
        return Sk.builtin.nmber(self.v.get(idx.indices), Sk.builtin.nmber.float$);
      } catch(e) {
        throw new Sk.builtin.Exception(e.message);
      }
    });
    
    
    $loc.__getattr__ = new Sk.builtin.func(function(self, attr) {
      if(attr == 'ndim') return Sk.builtin.nmber(self.v.size().length, Sk.builtin.nmber.int$)
      if(attr == 'shape') return Sk.builtin.tuple(self.v.size())
      
      return self.tp$getattr(attr);
    });
    
    $loc.__str__ = new Sk.builtin.func(function(self) {
      return Sk.misceval.callsim(mod.array_str, self);
    });
  };
  mod.ndarray = Sk.misceval.buildClass(mod, ndarray, 'ndarray', []);
  
    /**
   * linalg class
   */
   
  var linalg = function($gbl, $loc) {
    $loc.inv = new Sk.builtin.func(function(self) {
      return Sk.misceval.callsim(mod.inv, self);
    });
  };
  mod.linalg = Sk.misceval.buildClass(mod, linalg, 'linalg', []);  
  
  /**
   * creation functions
   */
  mod.array = new Sk.builtin.func(function(data) {
    Sk.builtin.pyCheckArgs('array', arguments, 1);
    
    return Sk.misceval.callsim(mod.ndarray, Sk.builtin.tuple(), data);
  });
  
  mod.zeros = new Sk.builtin.func(function(size) {
    Sk.builtin.pyCheckArgs('array', arguments, 1);
    var result=math.zeros(size.v[0].v,size.v[1].v);
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  /**
   * arithmetic functions
   */
  mod.add = new Sk.builtin.func(function(array1, array2) {
    Sk.builtin.pyCheckArgs('add', arguments, 2);
    
    var result;
    try {
      result = math.add(array1.v, array2.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.sub = new Sk.builtin.func(function(array1, array2) {
    Sk.builtin.pyCheckArgs('sub', arguments, 2);
    
    var result;
    try {
      result = math.subtract(array1.v, array2.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.multiply = new Sk.builtin.func(function(array1, array2) {
    Sk.builtin.pyCheckArgs('mul', arguments, 2);
    
    var result;
    try {
      result = math.emultiply(array1.v, array2.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.div = new Sk.builtin.func(function(array1, array2) {
    Sk.builtin.pyCheckArgs('div', arguments, 2);
    
    var result;
    try {
      result = math.divide(array1.v, array2.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.dot = new Sk.builtin.func(function(array1, array2) {
    Sk.builtin.pyCheckArgs('dot', arguments, 2);
    
    var result;
    try {
      result = math.multiply(array1.v, array2.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });

  mod.cross = new Sk.builtin.func(function(x, y, axis) {
    Sk.builtin.pyCheckArgs('cross', arguments, 2);

    var result;
    try {
    	if(!axis || axis.v==1){//expect row vectors
    	result=math.zeros(1,3);
	  		result.subset(math.index(0,0), x.v._data[0][1]*y.v._data[0][2]-x.v._data[0][2]*y.v._data[0][1]);
	  		result.subset(math.index(0,1), x.v._data[0][2]*y.v._data[0][0]-x.v._data[0][0]*y.v._data[0][2]); 
	  		result.subset(math.index(0,2), x.v._data[0][0]*y.v._data[0][1]-x.v._data[0][1]*y.v._data[0][0] );
    	} else { //col vectors
    	    result=math.zeros(3,1);
	  		result.subset(math.index(0,0), x.v._data[1]*y.v._data[2]-x.v._data[2]*y.v._data[1]);
	  		result.subset(math.index(1,0), x.v._data[2]*y.v._data[0]-x.v._data[0]*y.v._data[2]); 
	  		result.subset(math.index(2,0), x.v._data[0]*y.v._data[1]-x.v._data[1]*y.v._data[0]);
    	}
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.transpose = new Sk.builtin.func(function(array1) {
    Sk.builtin.pyCheckArgs('transpose', arguments, 1);
    
    var result;
    try {
      result = math.transpose(array1.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.inv = new Sk.builtin.func(function(array1) {
    Sk.builtin.pyCheckArgs('inv', arguments, 1);
    
    var result;
    try {
      result = math.inv(array1.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.vstack = new Sk.builtin.func(function(array_tuple) {
    Sk.builtin.pyCheckArgs('vstack', arguments, 1);
    
    var args = [], idx, value;
    
    for(idx = 0; idx < array_tuple.v.length; ++idx) {
      value = array_tuple.v[idx];
      
      if(value.tp$name === 'number') {
        value = math.matrix([[value.v]])
      } else {
        value = value.v;
      } 
      args.push(value);
    }
    
    // dimension argument
    args.push(0);
    
    var result;
    try {
      result = math.concat.apply(undefined, args);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
  
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.arange = new Sk.builtin.func(function(start,end,step) {
    Sk.builtin.pyCheckArgs('arange', arguments, 3);
    
    var result;
    try {
      result = math.range(start.v,end.v,step.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.random = new Sk.builtin.func(function(rows,cols) {
    Sk.builtin.pyCheckArgs('random', arguments, 2);
    
    var result;
    try {
         var mat=math.zeros(rows.v, cols.v);
		 result = mat.map(function (value, index, v) {
         return math.random(0, 1);
      });
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.mean = new Sk.builtin.func(function(array1) {
    Sk.builtin.pyCheckArgs('mean', arguments, 1);
    
    var result;
    try {
      result = math.mean(array1.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.var = new Sk.builtin.func(function(array1) {
    Sk.builtin.pyCheckArgs('var', arguments, 1);
    
    var result;
    try {
      result = math.var(array1.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  mod.std = new Sk.builtin.func(function(array1) {
    Sk.builtin.pyCheckArgs('std', arguments, 1);
    
    var result;
    try {
      result = math.std(array1.v);
    } catch(e) {
      throw new Sk.builtin.Exception(e.message);
    }
    return Sk.misceval.callsim(mod.ndarray, undefined, result);
  });
  
  /**
   * logic functions
   */
  mod.allclose = new Sk.builtin.func(function(a, b) {
    Sk.builtin.pyCheckArgs('allclose', arguments, 2, 4);
    
    var rtol = 1e-5, atol = 1e-8;
    
    if(arguments.length > 2) {
      Sk.builtin.pyCheckType('rtol', 'number', Sk.builtin.checkNumber(arguments[2]));
      rtol = arguments[2].v
    }
    if(arguments.length > 3) {
      Sk.builtin.pyCheckType('atol', 'number', Sk.builtin.checkNumber(arguments[3]));
      atol = arguments[3].v
    }
    
    var result = true;
    
    math.collection.deepMap2(a.v, b.v, function(v1, v2) {
    	result = result && (Math.abs(v1 - v2) <= (atol + rtol * Math.abs(v2)));
    });
    
    return Sk.builtin.bool(result)
  });
  
  /**
   * output functions
   */
  mod.array_str = new Sk.builtin.func(function(array) {
    Sk.builtin.pyCheckArgs('array_str', arguments, 1);
    var str =math.format(array.v,5).replace(/\], \[/g, ']\n [');
    return Sk.builtin.str(str.replace(/,/g, ''));
    //return Sk.builtin.str(math.format(array.v));
  });
  
  return mod;
}

L.Control.MiniMapLayerSwitcher = L.Control.extend({
	_className: 'leaflet-mini-map-control-layers',

	options: {
		miniMapLabelHeight: 22,
		miniMapHeight: 80,
		miniMapWidth: 90,
		miniMapMargin: 10,
		miniMapZoomOffset: -3,
		position: 'topright',
		autoZIndex: true
	},

	initialize: function (baseLayers, options) {
		L.setOptions(this, options);

		this._layers = [];
		this._miniMaps = {};
		this._lastZIndex = 0;

		for (var i in baseLayers) {
			this._addLayer(baseLayers[i], i);
		}
	},

	addTo: function (map) {
		var that = this;

		L.Control.prototype.addTo.call(this, map);

		this._updateMiniMaps();

		// Invalidate size for each minimap since it has now been added to the DOM
		this._forEachLayer(function (layerObj) {
			var layerId = layerObj.id,
				miniMap = that._miniMaps[layerId];

			miniMap.invalidateSize();
		});

		return this;
	},

	onAdd: function () {
		this._map
			.on('move', this._updateMiniMaps, this)
			.whenReady(this._onMapReady, this);

		this._render();

		return this._container;
	},

	onRemove: function () {
		this._map.off('move', this._updateMiniMaps, this);
	},

	_render: function () {
		var container = this._container = L.DomUtil.create('div', this._className),
			inner = this._inner = L.DomUtil.create('div', this._className + '-inner'),
			initialActiveLayerId, initialActiveMiniMapLayerId;

		//Makes this work on IE10 Touch devices by stopping it from firing a mouseout event when the touch is released
		container.setAttribute('aria-haspopup', true);

		L.DomEvent.disableClickPropagation(container);

		if (!L.Browser.touch) {
			L.DomEvent
				.on(container, 'mousewheel', L.DomEvent.stopPropagation)
				.on(container, 'mouseenter', this._expand, this)
				.on(container, 'mouseleave', this._contract, this);
		} else {
			L.DomEvent.on(container, 'click', this._toggleMiniMaps, this);
		}

		container.style.height = this.options.miniMapHeight + this.options.miniMapLabelHeight + 'px';
		container.appendChild(inner);

		this._forEachLayer(function (layerObj) {
			this._renderMiniMap(layerObj, inner);
		}, this);

		// only show the minimap if there are layers to switch between
		if (!this._hasMultipleLayers()) {
			this._container.style.display = 'none';
			return;
		}

		initialActiveLayerId = this._getInitialMainMapLayerId();
		initialActiveMiniMapLayerId = this._getInitialMiniMapLayerId(initialActiveLayerId);

		// set the layer that will be switched to
		this._activeLayerId = initialActiveMiniMapLayerId;

		// now swap to the one we really want as the initial map layer
		this._switchLayer(initialActiveLayerId);
	},

	_toggleMiniMaps: function () {
		var isExpanded = L.DomUtil.hasClass(this._container, 'expanded');

		this._animateMiniMaps(!isExpanded);
	},

	_expand: function () {
		this._animateMiniMaps(true);
	},

	_contract: function () {
		this._animateMiniMaps(false);
	},

	_renderMiniMap: function (layerObj, container) {
		var miniMapContainer = this._mapContainer = L.DomUtil.create('div', 'map-container'),
			miniMapContainerInner = L.DomUtil.create('div', 'map-container-inner'),
			miniMap = this._mapContainer = L.DomUtil.create('div', 'map'),
			miniMapLabel = L.DomUtil.create('div', 'map-label'),
			layerId = layerObj.id,
			layer = this._findLayer(layerId);

		L.DomEvent.on(miniMapContainer, 'click', this._onMiniMapClicked, this);

		miniMap.style.height = this.options.miniMapHeight + 'px';
		miniMap.style.width = this.options.miniMapWidth + 'px';
		miniMapLabel.innerHTML = layerObj.name;

		miniMapContainerInner.appendChild(miniMap);
		miniMapContainerInner.appendChild(miniMapLabel);

		miniMapContainer.layerId = layerId;
		miniMapContainer.style.width = this.options.miniMapWidth + 'px';
		miniMapContainer.appendChild(miniMapContainerInner);

		container.appendChild(miniMapContainer);

		this._addMiniMap(layerId, layer.miniMapLayer, miniMap);
	},

	_addMiniMap: function (layerId, miniMapLayer, mapContainer) {
		var zoomOffset = this.options.miniMapZoomOffset,
			minZoom = this._map.getMinZoom(),
			maxZoom = this._map.getMaxZoom(),
			miniMap = L.map(mapContainer, {
				dragging: false,
				touchZoom: false,
				scrollWheelZoom: false,
				doubleClickZoom: false,
				boxZoom: false,
				trackResize: false,
				attributionControl: false,
				zoomControl: false,
				inertia: false,
				worldCopyJump: false,
				layers: [miniMapLayer],
				minZoom: minZoom + zoomOffset,
				maxZoom: maxZoom + zoomOffset
			});

		this._miniMaps[layerId] = miniMap;
	},

	_addLayer: function (layer, name) {
		var id = L.stamp(layer),
			i, clonedLayer, layerGroupLayer;

		if (layer instanceof L.LayerGroup) {
			clonedLayer = new L.LayerGroup();
			for (i in layer._layers) {
				layerGroupLayer = layer._layers[i];
				if (layerGroupLayer instanceof L.TileLayer) {
					clonedLayer.addLayer(new L.TileLayer(layerGroupLayer._url, layerGroupLayer.options));
				}
			}
		} else {
			clonedLayer = new L.TileLayer(layer._url, layer.options);
		}

		this._layers.push({
			id: id,
			name: name,
			mainMapLayer: layer,
			miniMapLayer: clonedLayer
		});

		if (this.options.autoZIndex && layer.setZIndex) {
			this._lastZIndex++;
			layer.setZIndex(this._lastZIndex);
		}
	},

	_findLayer: function (layerId) {
		var layers = this._layers,
			layerCount = layers.length,
			i, layer;

		for (i = 0; i < layerCount; i++) {
			layer = layers[i];
			if (layer.id === layerId) {
				return layer;
			}
		}

		// Returns null if we can't find the layer
		return null;
	},

	_getCurrentTarget: function (event) {
		if (event.currentTarget) {
			return event.currentTarget;
		}

		// recursively go up the dom to find the element we're after
		return this._getFirstElementWithClass(event.srcElement, 'map-container');
	},

	_getFirstElementWithClass: function (el, className) {
		var hasClass = L.DomUtil.hasClass(el, className),
			parent = el.parentNode;

		return hasClass ? el : this._getFirstElementWithClass(parent, className);
	},

	_onMiniMapClicked: function (e) {
		var container = this._container,
			mapContainer = this._getCurrentTarget(e),
			clickedLayerId = mapContainer.layerId,
			isExpanded = L.DomUtil.hasClass(this._container, 'expanded'),
			clickedMainMapLayer;

		// must have been expanded before we are able to click on a minimap (relevant for touch devices)
		if (!isExpanded) {
			return;
		}

		// no need to switch if the clicked layer is already active
		if (clickedLayerId === this._activeLayerId) {
			return;
		}

		clickedMainMapLayer = this._findLayer(clickedLayerId);

		// ensure that if we swap between main/mini maps that it's super quick rather than a transition
		L.DomUtil.addClass(container, 'notransition');

		// show the layer that was clicked in the main map
		this._switchLayer(clickedLayerId);
		this._map.fire('baselayerchanged', clickedMainMapLayer.mainMapLayer);

		// force reflow
		L.Util.falseFn(mapContainer.offsetWidth);

		L.DomUtil.removeClass(container, 'notransition');
	},

	_switchLayer: function (newActiveLayerId) {
		var lastActiveLayerId = this._activeLayerId,
			lastActiveLayer = this._findLayer(lastActiveLayerId),
			newActiveLayer = this._findLayer(newActiveLayerId),
			newActiveMiniMapContainer = this._getMiniMapContainer(newActiveLayerId),
			mapContainer, suggestedLayerId, suggestedMiniMapContainer;

		this._moveLayerToBack(newActiveLayer);

		// Get the new suggested layer vars
		suggestedLayerId = this._layers[0].id;
		suggestedMiniMapContainer = this._getMiniMapContainer(suggestedLayerId);

		this._suggestedLayerId = suggestedLayerId;
		this._activeLayerId = newActiveLayerId;

		// set classes for the relevant minimaps
		this._forEachLayer(function (layerObj) {
			mapContainer = this._getMiniMapContainer(layerObj.id);

			L.DomUtil.removeClass(mapContainer, 'active-map');
			L.DomUtil.removeClass(mapContainer, 'suggested-map');
		});

		L.DomUtil.addClass(newActiveMiniMapContainer, 'active-map');
		L.DomUtil.addClass(suggestedMiniMapContainer, 'suggested-map');

		// maps cannot share the same layer, so remove the layers from any map
		this._map.removeLayer(lastActiveLayer.mainMapLayer);
		this._map.addLayer(newActiveLayer.mainMapLayer);
	},

	_moveLayerToBack: function (activeLayer) {
		var activeLayerId = activeLayer.id,
			layers = this._layers,
			layerCount = layers.length,
			i;

		for (i = 0; i < layerCount; i++) {
			if (layers[i].id === activeLayerId) {
				activeLayer = layers.splice(i, 1)[0];
				layers.push(activeLayer);
				break;
			}
		}
	},

	_animateMiniMaps: function (expand) {
		var mapsShown = 0,
			mapWidth = this.options.miniMapWidth,
			mapMargin = this.options.miniMapMargin,
			controlContainer = this._container,
			currentlyExpanded = L.DomUtil.hasClass(controlContainer, 'expanded'),
			mapContainer, layerId;

		if (currentlyExpanded === expand) {
			return;
		}

		this._forEachLayer(function (layerObj) {
			layerId = layerObj.id;
			mapContainer = this._getMiniMapContainer(layerId);

			// update the position on all the visible maps
			this._updateMiniMapPosition(layerId);

			if (expand) {
				mapContainer.style.left = (mapsShown * (mapWidth + mapMargin)) + 'px';
				mapsShown++;
			} else {
				mapContainer.style.left = '0';
			}
		});

		if (expand) {
			controlContainer.style.width = (mapsShown * (mapWidth + mapMargin)) - mapMargin + 'px';
			L.DomUtil.addClass(controlContainer, 'expanded');
		} else {
			controlContainer.style.width = '0';
			L.DomUtil.removeClass(controlContainer, 'expanded');
		}
	},

	_getInitialMainMapLayerId: function () {
		var layer, initialLayerId;

		// set the current main map layer to the first layer that the map has
		this._forEachLayer(function (layerObj) {
			layer = layerObj.mainMapLayer;

			if (this._map.hasLayer(layer)) {
				initialLayerId = layerObj.id;
				return false;
			}
		});

		if (initialLayerId) {
			return initialLayerId;
		}

		// if the map didn't have any layers layers on it, just pick the first in the list
		this._forEachLayer(function (layerObj) {
			initialLayerId = layerObj.id;
			return false;
		});

		return initialLayerId;
	},

	_getInitialMiniMapLayerId: function (initialMapLayer) {
		var layerId, initialLayerId;

		this._forEachLayer(function (layerObj) {
			layerId = layerObj.id;
			if (layerId !== initialMapLayer) {
				initialLayerId = layerId;
				return false;
			}
		});

		return initialLayerId;
	},

	_forEachLayer: function (callback) {
		var layers = this._layers,
			layerCount = layers.length,
			layer, i;

		for (i = 0; i < layerCount; i++) {
			layer = layers[i];

			if (callback.call(this, layer) === false) {
				break;
			}
		}
	},

	_getMiniMapContainer: function (layerId) {
		var miniMap = this._miniMaps[layerId];
		return miniMap.getContainer().parentNode.parentNode;
	},

	_updateMiniMaps: function () {
		var suggestedLayerId = this._suggestedLayerId,
			isExpanded = L.DomUtil.hasClass(this._container, 'expanded');

		// touch devices can have the container open while scrolling the map
		if (isExpanded) {
			this._forEachLayer(function (layerObj) {
				this._updateMiniMapPosition(layerObj.id);
			}, this);
		} else {
			this._updateMiniMapPosition(suggestedLayerId);
		}
	},

	_updateMiniMapPosition: function (layerId) {
		var mainMap, center, zoom, miniMap;

		if (!this._mainMapReady || !this._hasMultipleLayers()) {
			return;
		}

		mainMap = this._map;
		center = mainMap.getCenter();
		// ideally we would listen to the zoomend and use newZoom when implemented.
		// See: https://github.com/Leaflet/Leaflet/pull/1600
		zoom = mainMap.getZoom() + this.options.miniMapZoomOffset;

		// update minimap position
		miniMap = this._miniMaps[layerId];
		miniMap.setView(center, zoom, {
			pan: {
				animate: false
			},
			zoom: {
				animate: true
			}
		});
	},

	_onMapReady: function () {
		this._mainMapReady = true;
	},

	_hasMultipleLayers: function () {
		return this._layers.length > 0;
	}
});

L.control.miniMapLayerSwitcher = function (baseLayers, options) {
	return new L.Control.MiniMapLayerSwitcher(baseLayers, options);
};
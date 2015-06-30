/*
 * L.Handler.TouchZoom is used by L.Map to add pinch zoom on supported mobile browsers.
 */

L.Map.mergeOptions({
	touchZoom: L.Browser.touch && !L.Browser.android23,
	bounceAtZoomLimits: true
});

L.Map.TouchZoom = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'touchstart', this._onTouchStart, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'touchstart', this._onTouchStart, this);
	},

	_onTouchStart: function (e) {
		var map = this._map;

		if (!e.touches || e.touches.length !== 2 || map._animatingZoom || this._zooming) { return; }

		var p1 = map.mouseEventToContainerPoint(e.touches[0]),
		    p2 = map.mouseEventToContainerPoint(e.touches[1]),
		    vector = p1.subtract(p2);

		this._pinchStartPoint = p1.add(p2)._divideBy(2);
		this._startCenter = map.containerPointToLatLng(map.getSize()._divideBy(2));
		this._startDist = p1.distanceTo(p2);
		this._startZoom = map.getZoom();
		this._startTheta = Math.atan(vector.x / vector.y);
		this._startBearing = map.getBearing();
		if (vector.y < 0) { this._startBearing += 180; }

		this._moved = false;
		this._rotated = false;
		this._zooming = true;

		map.stop();

		L.DomEvent
		    .on(document, 'touchmove', this._onTouchMove, this)
		    .on(document, 'touchend', this._onTouchEnd, this);

		L.DomEvent.preventDefault(e);
	},

	_onTouchMove: function (e) {
		if (!e.touches || e.touches.length !== 2 || !this._zooming) { return; }

		var map = this._map,
		    p1 = map.mouseEventToContainerPoint(e.touches[0]),
		    p2 = map.mouseEventToContainerPoint(e.touches[1]),
		    vector = p1.subtract(p2),
		    scale = p1.distanceTo(p2) / this._startDist,
		    delta;

		this._zoom = map.getScaleZoom(scale, this._startZoom);

		if (map.options.touchZoom === 'center') {
			delta = new L.Point(0, 0);
			this._center = map.getCenter();
		} else {
			delta = p1._add(p2)._divideBy(2)._subtract(this._pinchStartPoint);
			this._center = map.containerPointToLatLng(map.latLngToContainerPoint(this._startCenter).subtract(delta));
		}

		if (map.options.rotate) {
			var theta = Math.atan(vector.x / vector.y);
			var bearingDelta = (theta - this._startTheta) * L.DomUtil.RAD_TO_DEG;
			if (vector.y < 0) { bearingDelta += 180; }
			if (bearingDelta) {
				/// TODO: The pivot should be the last touch point, but zoomAnimation manages to
				///   overwrite the rotate pane position. Maybe related to #3529.
				map.setBearing(this._startBearing - bearingDelta, true);
				this._rotated = true;
			}
		}

		if (scale === 1 && delta.x === 0 && delta.y === 0) { return; }

		if (!map.options.bounceAtZoomLimits) {
			if ((this._zoom <= map.getMinZoom() && scale < 1) ||
		        (this._zoom >= map.getMaxZoom() && scale > 1)) { return; }
		}

		if (!this._moved) {
			map._moveStart(true);
			this._moved = true;
		}

		L.Util.cancelAnimFrame(this._animRequest);

		var moveFn = L.bind(map._move, map, this._center, this._zoom, {pinch: true, round: false});
		this._animRequest = L.Util.requestAnimFrame(moveFn, this, true, map._container);

		L.DomEvent.preventDefault(e);
	},

	_onTouchEnd: function () {
		if (!this._moved || !this._zooming) {
			this._zooming = false;
			return;
		}

		this._zooming = false;
		L.Util.cancelAnimFrame(this._animRequest);

		L.DomEvent
		    .off(document, 'touchmove', this._onTouchMove)
		    .off(document, 'touchend', this._onTouchEnd);

		var zoom = this._zoom;
		zoom = this._map._limitZoom(zoom - this._startZoom > 0 ? Math.ceil(zoom) : Math.floor(zoom));

		this._map._animateZoom(this._center, zoom, true, true);

		if (this._rotated) {
			this._map.setBearing(this._map.getBearing());
		}
	}
});

L.Map.addInitHook('addHandler', 'touchZoom', L.Map.TouchZoom);

import { LayaGL } from "laya/layagl/LayaGL";
import { Resource } from "laya/resource/Resource";
import { Stat } from "laya/utils/Stat";
import { WebGLContext } from "laya/webgl/WebGLContext";
import { VertexBuffer3D } from "../../graphics/VertexBuffer3D";
import { Color } from "../../math/Color";
import { MathUtils3D } from "../../math/MathUtils3D";
import { Vector3 } from "../../math/Vector3";
import { BufferState } from "../BufferState";
import { GeometryElement } from "../GeometryElement";
import { TextureMode } from "../TextureMode";
import { VertexTrail } from "././VertexTrail";
/**
 * <code>TrailGeometry</code> 类用于创建拖尾渲染单元。
 */
export class TrailGeometry extends GeometryElement {
    constructor(owner) {
        super();
        /**@private */
        this._floatCountPerVertices1 = 8;
        /**@private */
        this._floatCountPerVertices2 = 5;
        /**@private */
        this._increaseSegementCount = 128;
        /**@private */
        this._activeIndex = 0;
        /**@private */
        this._endIndex = 0;
        /**@private */
        this._needAddFirstVertex = false;
        /**@private */
        this._isTempEndVertex = false;
        /**@private */
        this._lastFixedVertexPosition = new Vector3();
        /** @private */
        this._bufferState = new BufferState();
        this.tmpColor = new Color();
        this._owner = owner;
        this._resizeData(this._increaseSegementCount, this._bufferState);
    }
    /**
     * @private
     */
    _resizeData(segementCount, bufferState) {
        this._segementCount = this._increaseSegementCount;
        this._subBirthTime = new Float32Array(segementCount);
        this._subDistance = new Float64Array(segementCount);
        var vertexCount = segementCount * 2;
        var vertexDeclaration1 = VertexTrail.vertexDeclaration1;
        var vertexDeclaration2 = VertexTrail.vertexDeclaration2;
        var vertexBuffers = [];
        var vertexbuffer1Size = vertexCount * vertexDeclaration1.vertexStride;
        var vertexbuffer2Size = vertexCount * vertexDeclaration2.vertexStride;
        var memorySize = vertexbuffer1Size + vertexbuffer2Size;
        this._vertices1 = new Float32Array(vertexCount * this._floatCountPerVertices1);
        this._vertexBuffer1 = new VertexBuffer3D(vertexbuffer1Size, WebGLContext.STATIC_DRAW, false);
        this._vertexBuffer1.vertexDeclaration = vertexDeclaration1;
        this._vertices2 = new Float32Array(vertexCount * this._floatCountPerVertices2);
        this._vertexBuffer2 = new VertexBuffer3D(vertexbuffer2Size, WebGLContext.DYNAMIC_DRAW, false);
        this._vertexBuffer2.vertexDeclaration = vertexDeclaration2;
        vertexBuffers.push(this._vertexBuffer1);
        vertexBuffers.push(this._vertexBuffer2);
        bufferState.bind();
        bufferState.applyVertexBuffers(vertexBuffers);
        bufferState.unBind();
        Resource._addMemory(memorySize, memorySize);
    }
    /**
     * @private
     */
    _resetData() {
        var count = this._endIndex - this._activeIndex;
        if (count == this._segementCount) { //当前count=_segementCount表示已满,需要扩充
            this._vertexBuffer1.destroy();
            this._vertexBuffer2.destroy();
            this._segementCount += this._increaseSegementCount;
            this._resizeData(this._segementCount, this._bufferState);
        }
        this._vertexBuffer1.setData(this._vertices1, 0, this._floatCountPerVertices1 * 2 * this._activeIndex, this._floatCountPerVertices1 * 2 * count);
        this._vertexBuffer2.setData(this._vertices2, 0, this._floatCountPerVertices2 * 2 * this._activeIndex, this._floatCountPerVertices2 * 2 * count);
        var offset = this._activeIndex * 4;
        var rightSubDistance = new Float64Array(this._subDistance.buffer, offset, count); //修改距离数据
        var rightSubBirthTime = new Float32Array(this._subBirthTime.buffer, offset, count); //修改出生时间数据
        this._subDistance.set(rightSubDistance, 0);
        this._subBirthTime.set(rightSubBirthTime, 0);
        this._endIndex = count;
        this._activeIndex = 0;
    }
    /**
     * @private
     * 更新Trail数据
     */
    _updateTrail(camera, lastPosition, position) {
        if (!Vector3.equals(lastPosition, position)) { //位置不变不产生分段
            if ((this._endIndex - this._activeIndex) === 0)
                this._addTrailByFirstPosition(camera, position); //当前分段全部消失时,需要添加一个首分段
            else
                this._addTrailByNextPosition(camera, position);
        }
    }
    /**
     * @private
     * 通过起始位置添加TrailRenderElement起始数据
     */
    _addTrailByFirstPosition(camera, position) {
        (this._endIndex === this._segementCount) && (this._resetData());
        this._subDistance[this._endIndex] = 0;
        this._subBirthTime[this._endIndex] = this._owner._curtime;
        this._endIndex++;
        position.cloneTo(this._lastFixedVertexPosition);
        this._needAddFirstVertex = true;
    }
    /**
     * @private
     * 通过位置更新TrailRenderElement数据
     */
    _addTrailByNextPosition(camera, position) {
        var delVector3 = TrailGeometry._tempVector30;
        var pointAtoBVector3 = TrailGeometry._tempVector31;
        Vector3.subtract(position, this._lastFixedVertexPosition, delVector3);
        var forward = TrailGeometry._tempVector32;
        switch (this._owner.alignment) {
            case TrailGeometry.ALIGNMENT_VIEW:
                camera.transform.getForward(forward);
                Vector3.cross(delVector3, forward, pointAtoBVector3);
                break;
            case TrailGeometry.ALIGNMENT_TRANSFORM_Z:
                this._owner._owner.transform.getForward(forward);
                Vector3.cross(delVector3, forward, pointAtoBVector3); //实时更新模式需要和view一样根据当前forward重新计算
                break;
        }
        Vector3.normalize(pointAtoBVector3, pointAtoBVector3);
        Vector3.scale(pointAtoBVector3, this._owner.widthMultiplier / 2, pointAtoBVector3);
        var delLength = Vector3.scalarLength(delVector3);
        var tempEndIndex;
        var offset;
        if (this._needAddFirstVertex) {
            this._updateVerticesByPositionData(position, pointAtoBVector3, this._endIndex - 1); //延迟更新首分段数据
            this._needAddFirstVertex = false;
        }
        if (delLength - this._owner.minVertexDistance >= MathUtils3D.zeroTolerance) { //大于最小距离产生新分段
            if (this._isTempEndVertex) {
                tempEndIndex = this._endIndex - 1;
                offset = delLength - this._subDistance[tempEndIndex];
                this._updateVerticesByPosition(position, pointAtoBVector3, delLength, tempEndIndex);
                this._owner._totalLength += offset; //不产生新分段要通过差值更新总距离
            }
            else {
                (this._endIndex === this._segementCount) && (this._resetData());
                this._updateVerticesByPosition(position, pointAtoBVector3, delLength, this._endIndex);
                this._owner._totalLength += delLength;
                this._endIndex++;
            }
            position.cloneTo(this._lastFixedVertexPosition);
            this._isTempEndVertex = false;
        }
        else {
            if (this._isTempEndVertex) {
                tempEndIndex = this._endIndex - 1;
                offset = delLength - this._subDistance[tempEndIndex];
                this._updateVerticesByPosition(position, pointAtoBVector3, delLength, tempEndIndex);
                this._owner._totalLength += offset; //不产生新分段要通过差值更新总距离
            }
            else {
                (this._endIndex === this._segementCount) && (this._resetData());
                this._updateVerticesByPosition(position, pointAtoBVector3, delLength, this._endIndex);
                this._owner._totalLength += delLength;
                this._endIndex++;
            }
            this._isTempEndVertex = true;
        }
    }
    /**
     * @private
     * 通过位置更新顶点数据
     */
    _updateVerticesByPositionData(position, pointAtoBVector3, index) {
        var vertexOffset = this._floatCountPerVertices1 * 2 * index;
        var curtime = this._owner._curtime;
        this._vertices1[vertexOffset] = position.x;
        this._vertices1[vertexOffset + 1] = position.y;
        this._vertices1[vertexOffset + 2] = position.z;
        this._vertices1[vertexOffset + 3] = -pointAtoBVector3.x;
        this._vertices1[vertexOffset + 4] = -pointAtoBVector3.y;
        this._vertices1[vertexOffset + 5] = -pointAtoBVector3.z;
        this._vertices1[vertexOffset + 6] = curtime;
        this._vertices1[vertexOffset + 7] = 1.0;
        this._vertices1[vertexOffset + 8] = position.x;
        this._vertices1[vertexOffset + 9] = position.y;
        this._vertices1[vertexOffset + 10] = position.z;
        this._vertices1[vertexOffset + 11] = pointAtoBVector3.x;
        this._vertices1[vertexOffset + 12] = pointAtoBVector3.y;
        this._vertices1[vertexOffset + 13] = pointAtoBVector3.z;
        this._vertices1[vertexOffset + 14] = curtime;
        this._vertices1[vertexOffset + 15] = 0.0;
        var floatCount = this._floatCountPerVertices1 * 2;
        this._vertexBuffer1.setData(this._vertices1, vertexOffset, vertexOffset, floatCount);
    }
    /**
     * @private
     * 通过位置更新顶点数据、距离、出生时间
     */
    _updateVerticesByPosition(position, pointAtoBVector3, delDistance, index) {
        this._updateVerticesByPositionData(position, pointAtoBVector3, index);
        this._subDistance[index] = delDistance;
        this._subBirthTime[index] = this._owner._curtime;
    }
    /**
     * @private
     * 更新VertexBuffer2数据
     */
    _updateVertexBufferUV() {
        var vertexCount = this._endIndex;
        var curLength = 0;
        var gradient = this._owner.colorGradient;
        var startAlphaIndex = gradient.colorAlphaKeysCount - 1;
        var startColorIndex = gradient.colorRGBKeysCount - 1;
        var totalLength = this._owner._totalLength;
        for (var i = this._activeIndex; i < vertexCount; i++) {
            (i !== this._activeIndex) && (curLength += this._subDistance[i]);
            var uvX;
            var lerpFactor;
            if (this._owner.textureMode == TextureMode.Stretch) {
                uvX = 1.0 - curLength / totalLength;
                lerpFactor = uvX;
            }
            else {
                lerpFactor = 1.0 - curLength / totalLength;
                uvX = 1.0 - (totalLength - curLength);
            }
            startColorIndex = gradient.evaluateColorRGB(lerpFactor, this.tmpColor, startColorIndex, true);
            startAlphaIndex = gradient.evaluateColorAlpha(lerpFactor, this.tmpColor, startAlphaIndex, true);
            var stride = this._floatCountPerVertices2 * 2;
            var index = i * stride;
            this._vertices2[index + 0] = uvX;
            this._vertices2[index + 1] = this.tmpColor.r;
            this._vertices2[index + 2] = this.tmpColor.g;
            this._vertices2[index + 3] = this.tmpColor.b;
            this._vertices2[index + 4] = this.tmpColor.a;
            this._vertices2[index + 5] = uvX;
            this._vertices2[index + 6] = this.tmpColor.r;
            this._vertices2[index + 7] = this.tmpColor.g;
            this._vertices2[index + 8] = this.tmpColor.b;
            this._vertices2[index + 9] = this.tmpColor.a;
        }
        var offset = this._activeIndex * stride;
        this._vertexBuffer2.setData(this._vertices2, offset, offset, vertexCount * stride - offset);
    }
    /**
     * @private
     */
    _updateDisappear() {
        var count = this._endIndex;
        for (var i = this._activeIndex; i < count; i++) {
            if (this._owner._curtime - this._subBirthTime[i] >= this._owner.time + MathUtils3D.zeroTolerance) {
                var nextIndex = i + 1;
                if (nextIndex !== count)
                    this._owner._totalLength -= this._subDistance[nextIndex]; //移除分段要减去下一分段到当前分段的距离
                if (this._isTempEndVertex && (nextIndex === count - 1)) { //如果只剩最后一分段要将其转化为固定分段
                    var offset = this._floatCountPerVertices1 * i * 2;
                    var fixedPos = this._lastFixedVertexPosition;
                    fixedPos.x = this._vertices1[0];
                    fixedPos.y = this._vertices1[1];
                    fixedPos.z = this._vertices1[2];
                    this._isTempEndVertex = false;
                }
                this._activeIndex++;
            }
            else {
                break;
            }
        }
    }
    /**
     * @inheritDoc
     */
    /*override*/ _getType() {
        return TrailGeometry._type;
    }
    /**
     * @inheritDoc
     */
    /*override*/ _prepareRender(state) {
        return this._endIndex - this._activeIndex > 1; //当前分段为0或1时不渲染
    }
    /**
     * @inheritDoc
     */
    /*override*/ _render(state) {
        this._bufferState.bind();
        var start = this._activeIndex * 2;
        var count = this._endIndex * 2 - start;
        LayaGL.instance.drawArrays(WebGLContext.TRIANGLE_STRIP, start, count);
        Stat.renderBatches++;
        Stat.trianglesFaces += count - 2;
    }
    /**
     * @inheritDoc
     */
    /*override*/ destroy() {
        super.destroy();
        var memorySize = this._vertexBuffer1._byteLength + this._vertexBuffer2._byteLength;
        Resource._addMemory(-memorySize, -memorySize);
        this._bufferState.destroy();
        this._vertexBuffer1.destroy();
        this._vertexBuffer2.destroy();
        this._bufferState = null;
        this._vertices1 = null;
        this._vertexBuffer1 = null;
        this._vertices2 = null;
        this._vertexBuffer2 = null;
        this._subBirthTime = null;
        this._subDistance = null;
        this._lastFixedVertexPosition = null;
    }
}
/** 轨迹准线_面向摄像机。*/
TrailGeometry.ALIGNMENT_VIEW = 0;
/** 轨迹准线_面向运动方向。*/
TrailGeometry.ALIGNMENT_TRANSFORM_Z = 1;
/**@private */
TrailGeometry._tempVector30 = new Vector3();
/**@private */
TrailGeometry._tempVector31 = new Vector3();
/**@private */
TrailGeometry._tempVector32 = new Vector3();
/**@private */
TrailGeometry._type = GeometryElement._typeCounter++;
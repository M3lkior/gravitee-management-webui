/*
 * Copyright (C) 2015 The Gravitee team (http://gravitee.io)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
class ApiAnalyticsController {
  constructor(ApiService, resolvedApi, $q, $scope, $state) {
    'ngInject';
    this.ApiService = ApiService;
    this.$scope = $scope;
    this.$state = $state;
    this.api = resolvedApi.data;
    this.$q = $q;

    this.analytics = this.analytics();

    this.indicatorChartOptions = {
      tooltips: {
        callbacks: {
          label: function (tooltipItem, data) {
            return data.labels[tooltipItem.index];
          }, afterLabel: function (tooltipItem, data) {
            return data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index] + '%';
          }
        }
      }
    };

    this.setTimeframe('3d');

    $scope.options = {
      elements: {
        point: {
          radius: 5
        }
      },
      scales: {
        xAxes: [{
          display: false
        }],
        yAxes: [{
          stacked: true
        }]
      },
      tooltips: {
        callbacks: {
          label: function (tooltipItem, data) {
            var labels = [];
            _.forEach(data.datasets, function (dataset) {
              labels.push(dataset.label + ': ' + dataset.data[tooltipItem.index]);
            });
            return labels;
          }
        }
      }
    };

    this.colorByBucket = [
      '#D6FF0D', '#FF0000', '#2ED0FF', '#E8930C', '#5D0CE8', '#7FFFD4', '#998A3D', '#B014CC', '#60998E', '#800080',
      '#800080', '#008000', '#FFFF00', '#F0A804', '#808080', '#000000', '#E729A5', '#FF005A', '#451453', '#61AFC2',
      '#B10821', '#6CB7AD', '#FBDD3F', '#725E43', '#47602C', '#2A0836', '#849612', '#191970', '#F5FA7D', '#B2AA00'
    ];

    $scope.chartConfig = [];

    var that = this;
    $scope.$watch('timeframeDate', function (date) {
      if (date) {
        var startDate = moment(date).startOf('day').valueOf();
        var endDate = moment(date).endOf('day').valueOf();
        $scope.analytics.range = {
          interval: 3600000,
          from: startDate,
          to: endDate
        };
        that.updateCharts();
      }
    })
  }

  openMenu($mdOpenMenu, ev) {
    $mdOpenMenu(ev);
  }

  updateTimeframe(timeframeId) {
    delete this.$scope.timeframeDate;
    this.setTimeframe(timeframeId);
  }

  setTimeframe(timeframeId) {
    var timeframe = _.find(this.analytics.timeframes, function (timeframe) {
      return timeframe.id === timeframeId;
    });

    var now = Date.now();

    var oldReport = (this.$scope.analytics === undefined) ? undefined : this.$scope.analytics.report;

    this.$scope.analytics = {
      timeframe: timeframe,
      report: oldReport,
      range: {
        interval: timeframe.interval,
        from: now - timeframe.range,
        to: now
      }
    };
    this.updateCharts();
  }

  updateCharts() {
    var _this = this;
    _.forEach(this.analytics.reports, function (report) {
      var requests = _.map(report.requests, function (req) {
        return req.call(_this.ApiService, _this.api.id,
          _this.$scope.analytics.range.from,
          _this.$scope.analytics.range.to,
          _this.$scope.analytics.range.interval);
      });

      _this.$q.all(requests).then(response => {
        _this.$scope.chartConfig[report.id] = {
          labels: _.map(response[0].data.timestamps, function (timestamp) {
            return moment(timestamp).format("YYYY-MM-DD HH:mm:ss");
          }),
          datasets: []
        };

        // Push data for global hits
        if (response[1] && response[1].data.values && response[1].data.values[0]) {
          _this.$scope.chartConfig[report.id].datasets.push({
            data: response[1].data.values[0].buckets[0].data,
            label: 'Calls',
            backgroundColor: 'rgba(220,220,220,0.2)',
            borderColor: 'rgba(220,220,220,1)',
            pointBackgroundColor: 'rgba(220,220,220,1)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgba(220,220,220,1)'
          });
        }

        // Push data for hits by 'something'
        if (response[0] && response[0].data.values && response[0].data.values[0]) {
          for (var i = 0; i < response[0].data.values[0].buckets.length; i++) {
            var lineColor = report.id === 'response-status' ? _this.getColorByStatus(response[0].data.values[0].buckets[i].name) : _this.colorByBucket[i];
            _this.$scope.chartConfig[report.id].datasets.push({
              label: report.labelPrefix + ' ' + response[0].data.values[0].buckets[i].name,
              data: response[0].data.values[0].buckets[i].data,
              backgroundColor: lineColor,
              borderColor: lineColor,
              pointBackgroundColor: 'rgba(220,220,220,0.2)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(220,220,220,1)'
            });
          }
        }
      });
    });

    // indicators
    _this.indicators = [];
    _this.indicatorChartData = {labels: [], datasets: [{data: [], backgroundColor: []}]};
    // first we need to get total calls to produce ratios
    var totalIndicator = _.find(this.analytics.indicators, 'isTotal');
    var request = totalIndicator.request.call(this.ApiService, this.api.id,
      this.$scope.analytics.range.from,
      this.$scope.analytics.range.to,
      this.$scope.analytics.range.interval,
      totalIndicator.key,
      totalIndicator.fieldName,
      totalIndicator.fieldValueFrom,
      totalIndicator.fieldValueTo);

    request.then(response => {
      totalIndicator.value = response.data.hits;
      this.total = totalIndicator.value;

      // then we get other indicators
      var indicators = _.filter(this.analytics.indicators, function (indicator) {
        return !indicator.isTotal;
      });
      _.forEach(indicators, function (indicator) {
        var request = indicator.request.call(_this.ApiService, _this.api.id,
          _this.$scope.analytics.range.from,
          _this.$scope.analytics.range.to,
          _this.$scope.analytics.range.interval,
          indicator.key,
          indicator.fieldName,
          indicator.fieldValueFrom,
          indicator.fieldValueTo);

        request.then(response => {
          indicator.value = response.data.hits;
          _this.indicatorChartData.labels.push(indicator.title);
          _this.indicatorChartData.datasets[0].data.push(_.round(indicator.value / _this.total * 100));
          _this.indicatorChartData.datasets[0].backgroundColor.push(indicator.color);
        });
      });
    });

    // tops
    _this.tops = [];
    _.forEach(this.analytics.tops, function (top) {
      var request = top.request.call(_this.ApiService, _this.api.id,
        _this.$scope.analytics.range.from,
        _this.$scope.analytics.range.to,
        _this.$scope.analytics.range.interval,
        top.key,
        top.fieldName,
        top.size);

      request.then(response => {
        top.results = response.data.values;
      });
    });
  }

  getColorByStatus(status) {
    if (_.startsWith(status, '2') || _.startsWith(status, '3')) {
      return 'green';
    } else if (_.startsWith(status, '4')) {
      return 'red';
    }
    return '#333';
  }

  analytics() {
    var _this = this;
    return {
      tops: [
        {
          title: 'Top applications',
          request: this.ApiService.apiTopHits,
          key: "top-apps",
          fieldName: "application",
          size: 10
        }],
      indicators: [
        {
          title: 'Total calls',
          request: this.ApiService.apiGlobalHits,
          key: "total-calls",
          fieldName: "status",
          fieldValueFrom: "200",
          fieldValueTo: "599",
          color: 'silver',
          isTotal: true
        },
        {
          title: 'Successful',
          request: this.ApiService.apiGlobalHits,
          key: "total-success",
          fieldName: "status",
          fieldValueFrom: "200",
          fieldValueTo: "399",
          color: _this.getColorByStatus('200')
        },
        {
          title: 'Business fails',
          request: this.ApiService.apiGlobalHits,
          key: "total-business-fails",
          fieldName: "status",
          fieldValueFrom: "400",
          fieldValueTo: "499",
          color: _this.getColorByStatus('400')
        },
        {
          title: 'Technical fails',
          request: this.ApiService.apiGlobalHits,
          key: "total-tech-fails",
          fieldName: "status",
          fieldValueFrom: "500",
          fieldValueTo: "599",
          color: _this.getColorByStatus('500')
        }
      ],
      reports: [
        {
          id: 'response-status',
          type: 'line',
          title: 'Response Status',
          labelPrefix: 'HTTP Status',
          requests: [this.ApiService.apiHitsByStatus]
        }, {
          id: 'response-times',
          type: 'bar',
          title: 'Response Times',
          labelPrefix: 'Latency',
          requests: [this.ApiService.apiHitsByLatency]
        }, {
          id: 'applications',
          type: 'line',
          title: 'Hits by applications',
          labelPrefix: '',
          requests: [this.ApiService.apiHitsByApplication]
        }
      ],
      timeframes: [
        {
          id: '5m',
          title: 'Last 5 minutes',
          range: 1000 * 60 * 5,
          interval: 10000
        }, {
          id: '1h',
          title: 'Last hour',
          range: 1000 * 60 * 60,
          interval: 1000 * 60
        }, {
          id: '24h',
          title: 'Last 24 hours',
          range: 1000 * 60 * 60 * 24,
          interval: 1000 * 60 * 60
        }, {
          id: '3d',
          title: 'Last 3 days',
          range: 1000 * 60 * 60 * 24 * 3,
          interval: 1000 * 60 * 60 * 3
        }, {
          id: '14d',
          title: 'Last 14 days',
          range: 1000 * 60 * 60 * 24 * 14,
          interval: 1000 * 60 * 60 * 5
        }, {
          id: '30d',
          title: 'Last 30 days',
          range: 1000 * 60 * 60 * 24 * 30,
          interval: 10000000
        }, {
          id: '90d',
          title: 'Last 90 days',
          range: 1000 * 60 * 60 * 24 * 90,
          interval: 10000000
        }
      ]
    };
  }
}

export default ApiAnalyticsController;
